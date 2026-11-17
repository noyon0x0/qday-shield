import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createQDayApi, loadApiConfig } = await import(process.env.QDAY_API_ENTRY);
const timestamp = Date.UTC(2026, 2, 1);

async function createService(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "qday-api-test-"));
  const config = loadApiConfig({ QDAY_AUDIT_DIR: directory, QDAY_API_PORT: "4174" }, process.cwd());
  const service = createQDayApi({ config, clock: () => timestamp, ...options });
  await service.initialize();
  await new Promise((resolve, reject) => {
    service.server.once("error", reject);
    service.server.listen(0, "127.0.0.1", resolve);
  });
  const address = service.server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise((resolve) => service.server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { service, base };
}

const postJson = (base, path, body, method = "POST") => fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const action = (requestId, amount = "100", recipient = "qday-demo://recipient/treasury") => ({ requestId, amount, recipient, signerMode: "hybrid-test", authorizationExpiresAt: timestamp + 60_000 });

test("API strictly validates simulation requests and keeps observation sources separate", async (t) => {
  const { base } = await createService(t);
  const bad = await postJson(base, "/api/security/decisions", { ...action("demo-bad"), privateKey: "must-not-be-reflected" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.text()).includes("must-not-be-reflected"), false);

  const accepted = await postJson(base, "/api/security/decisions", action("demo-allow"));
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).decision.status, "allow");

  const unknown = await postJson(base, "/api/security/decisions", action("demo-unknown", "20", "qday-demo://recipient/unknown"));
  const unknownPayload = await unknown.json();
  assert.equal(unknownPayload.decision.status, "deny");
  assert.ok(unknownPayload.decision.reasons.some((reason) => reason.code === "UNKNOWN_RECIPIENT"));

  const pending = await postJson(base, "/api/security/decisions", action("demo-approval", "600"));
  assert.equal((await pending.json()).decision.status, "requires-approval");
  const approved = await postJson(base, "/api/security/decisions/demo-approval/approval", { approvedBy: "demo-approver", decision: "approved" });
  assert.equal((await approved.json()).decision.status, "allow");

  const paused = await postJson(base, "/api/policies/emergency-pause", { paused: true, operator: "demo-operator" }, "PATCH");
  assert.equal((await paused.json()).emergencyPaused, true);
  const denied = await postJson(base, "/api/security/decisions", action("demo-paused"));
  assert.ok((await denied.json()).decision.reasons.some((reason) => reason.code === "ENGINE_PAUSED"));

  const compromised = await postJson(base, "/api/simulator/scenarios", { ...action("demo-compromised"), signerMode: "classical-compromise" });
  const compromisedPayload = await compromised.json();
  assert.equal(compromisedPayload.source, "demo-simulation");
  assert.ok(compromisedPayload.outcome.reasons.some((reason) => reason.code === "CLASSICAL_KEY_COMPROMISED_SIMULATED"));

  const observation = await (await fetch(`${base}/api/observations/qorechain`)).json();
  assert.deepEqual([observation.source, observation.state], ["qorechain-testnet", "not-collected"]);
  const events = await (await fetch(`${base}/api/audit/events?limit=20`)).json();
  assert.equal(events.source, "demo-audit");
  assert.ok(events.events.length >= 6);
  assert.equal((await (await fetch(`${base}/api/audit/verify`)).json()).valid, true);
});

test("audit persistence survives restart and rejects a modified record", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qday-api-restart-test-"));
  const config = loadApiConfig({ QDAY_AUDIT_DIR: directory }, process.cwd());
  const first = createQDayApi({ config, clock: () => timestamp });
  await first.initialize();
  await first.store.append({ eventType: "decision", occurredAt: timestamp, details: { policyId: "qday-demo-policy-v1", requestId: "demo-existing", status: "allow", amount: "5" } });
  await first.store.append({ eventType: "control", occurredAt: timestamp, details: { policyId: "qday-demo-policy-v1", control: "emergency-pause", paused: true, changedBy: "demo-operator" } });
  const records = await first.store.list();
  await first.server.close(() => {});
  const second = createQDayApi({ config, clock: () => timestamp });
  await second.initialize();
  assert.equal((await second.store.verify()).valid, true);
  assert.equal(second.engine.snapshot.cumulativeSpent, "5");
  assert.equal(second.engine.snapshot.emergencyPaused, true);
  const persistedPath = second.store.path;
  const text = await readFile(persistedPath, "utf8");
  await writeFile(persistedPath, text.replace('"amount":"5"', '"amount":"9"'), { mode: 0o600 });
  const invalid = await second.store.verify();
  assert.equal(invalid.valid, false);
  assert.equal(invalid.recordsChecked, 0);
  await writeFile(persistedPath, text, { mode: 0o600 });
  assert.equal((await second.store.reloadAndVerify()).valid, true);
  await writeFile(persistedPath, text.split("\n").slice(0, -1).reverse().join("\n") + "\n", { mode: 0o600 });
  const reordered = await second.store.verify();
  assert.equal(reordered.valid, false);
  assert.equal(reordered.failingSequence, 1);
  await rm(directory, { recursive: true, force: true });
});

test("remote binding requires a strong token and audit storage cannot be web-served", () => {
  assert.throws(() => loadApiConfig({ QDAY_API_HOST: "0.0.0.0" }, process.cwd()), /QDAY_ALLOW_REMOTE/);
  assert.throws(() => loadApiConfig({ QDAY_ALLOW_REMOTE: "true", QDAY_API_TOKEN: "short" }, process.cwd()), /32 to 256/);
  assert.throws(() => loadApiConfig({ QDAY_AUDIT_DIR: "dist/audit" }, process.cwd()), /web-served/);
});

test("sensitive decision routes are rate limited and reject unknown query fields", async (t) => {
  const { base } = await createService(t);
  assert.equal((await fetch(`${base}/api/policies?admin=true`)).status, 400);
  let last;
  for (let index = 0; index < 21; index += 1) {
    last = await postJson(base, "/api/security/decisions", {});
  }
  assert.equal(last.status, 429);
});

test("audit verification endpoint detects disk tampering and fails closed", async (t) => {
  const { service, base } = await createService(t);
  const result = await postJson(base, "/api/security/decisions", action("demo-tamper"));
  assert.equal((await result.json()).decision.status, "allow");
  const original = await readFile(service.store.path, "utf8");
  await writeFile(service.store.path, original.replace('"amount":"100"', '"amount":"101"'), { mode: 0o600 });
  const verification = await fetch(`${base}/api/audit/verify`);
  assert.equal(verification.status, 409);
  assert.equal((await verification.json()).valid, false);
  const denied = await postJson(base, "/api/security/decisions", action("demo-after-tamper"));
  assert.equal(denied.status, 503);
});
