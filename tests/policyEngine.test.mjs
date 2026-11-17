import assert from "node:assert/strict";
import test from "node:test";

const coreEntry = process.env.QDAY_SECURITY_CORE_ENTRY;
if (!coreEntry) throw new Error("Run this suite through tests/run-tests.mjs.");
const {
  TamperEvidentAuditLog,
  SecurityPolicyEngine,
  createDemoPolicy,
  createFakeTestIdentity,
  createHumanApproval,
  createSimulatedTransfer,
  createUncompromisedTestActor,
  simulateClassicalKeyCompromise,
} = await import(coreEntry);

const NOW = 1_800_000_000_000;
const POLICY_EXPIRY = NOW + 60_000;
const AUTH_EXPIRY = NOW + 30_000;
const ALLOWED_RECIPIENT = "qday-demo://recipient/treasury";

function setup({ policyOverrides = {}, actor = undefined } = {}) {
  const policy = { ...createDemoPolicy(POLICY_EXPIRY), ...policyOverrides };
  const auditLog = new TamperEvidentAuditLog();
  const engine = new SecurityPolicyEngine(policy, auditLog);
  const identity = createFakeTestIdentity("Test Operator");
  const signer = actor ?? createUncompromisedTestActor(identity);
  const makeAction = (overrides = {}) => createSimulatedTransfer({
    requestId: "test-request-001",
    actor: signer,
    recipient: ALLOWED_RECIPIENT,
    amount: 100n,
    authorizationExpiresAt: AUTH_EXPIRY,
    ...overrides,
  });
  return { engine, auditLog, identity, signer, makeAction };
}

test("allows an authorized fake-test action and records it", async () => {
  const { engine, auditLog, makeAction } = setup();
  const decision = await engine.evaluate(makeAction(), { now: NOW });
  assert.equal(decision.status, "allow");
  assert.deepEqual(decision.reasons, []);
  assert.equal(engine.snapshot.cumulativeSpent, "100");
  assert.equal(auditLog.records.length, 1);
  assert.equal(auditLog.records[0].details.status, "allow");
  assert.equal((await auditLog.verify()).valid, true);
});

test("denies a simulated classical secp256k1 compromise attempt", async () => {
  const identity = createFakeTestIdentity("Compromise Scenario");
  const { engine, makeAction } = setup({ actor: simulateClassicalKeyCompromise(identity) });
  const decision = await engine.evaluate(makeAction(), { now: NOW });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "CLASSICAL_KEY_COMPROMISED_SIMULATED"));
  assert.ok(decision.reasons.some((reason) => reason.code === "CLASSICAL_SIGNATURE_NOT_AUTHORIZED"));
});

test("rejects an identity that was not minted by the fake-test identity factory", async () => {
  const { engine, signer, makeAction } = setup();
  const forgedActor = {
    ...signer,
    identity: {
      environment: "qday-local-demo",
      identityId: "demo:forged",
      displayAddress: "qday-demo://identity/forged",
      label: "Forged identity",
    },
  };
  const decision = await engine.evaluate(makeAction({ actor: forgedActor }), { now: NOW });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "IDENTITY_NOT_TEST_ONLY"));
});

test("denies a recipient that is not allowlisted", async () => {
  const { engine, makeAction } = setup();
  const decision = await engine.evaluate(makeAction({ recipient: "qday-demo://recipient/unknown" }), { now: NOW });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "UNKNOWN_RECIPIENT"));
});

test("denies per-transaction limit violations", async () => {
  const { engine, makeAction } = setup();
  const decision = await engine.evaluate(makeAction({ amount: 1_001n }), { now: NOW });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "PER_TRANSACTION_LIMIT_EXCEEDED"));
});

test("denies cumulative spending limit violations", async () => {
  const { engine, makeAction } = setup({ policyOverrides: { cumulativeSpendingLimit: 150n } });
  assert.equal((await engine.evaluate(makeAction(), { now: NOW })).status, "allow");
  const next = makeAction({ requestId: "test-request-002", amount: 60n });
  const decision = await engine.evaluate(next, { now: NOW + 1 });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "CUMULATIVE_SPENDING_LIMIT_EXCEEDED"));
  assert.equal(engine.snapshot.cumulativeSpent, "100");
});

test("denies an expired authorization window", async () => {
  const { engine, makeAction } = setup();
  const decision = await engine.evaluate(makeAction({ authorizationExpiresAt: NOW }), { now: NOW });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "AUTHORIZATION_EXPIRED"));
});

test("denies a replayed request id and audits the replay decision", async () => {
  const { engine, auditLog, makeAction } = setup();
  const action = makeAction();
  assert.equal((await engine.evaluate(action, { now: NOW })).status, "allow");
  const replay = await engine.evaluate(action, { now: NOW + 1 });
  assert.equal(replay.status, "deny");
  assert.ok(replay.reasons.some((reason) => reason.code === "REPLAY_ATTEMPT"));
  assert.equal(auditLog.records.length, 2);
  assert.equal(auditLog.records[1].details.status, "deny");
});

test("emergency pause denies all outgoing simulated actions", async () => {
  const { engine, auditLog, makeAction } = setup();
  await engine.setEmergencyPause(true, { now: NOW, changedBy: "demo-operator" });
  const decision = await engine.evaluate(makeAction(), { now: NOW + 1 });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "ENGINE_PAUSED"));
  assert.equal(engine.snapshot.cumulativeSpent, "0");
  assert.equal(auditLog.records.length, 2);
  assert.equal(auditLog.records[0].eventType, "control");
});

test("requires human approval above the configured threshold, then permits a matching approval", async () => {
  const { engine, makeAction } = setup();
  const action = makeAction({ amount: 700n });
  const pending = await engine.evaluate(action, { now: NOW });
  assert.equal(pending.status, "requires-approval");
  assert.ok(pending.reasons.some((reason) => reason.code === "HUMAN_APPROVAL_REQUIRED"));

  const approval = createHumanApproval(action, "second-human-reviewer", NOW + 1);
  const approved = await engine.evaluate({ ...action, approval }, { now: NOW + 2 });
  assert.equal(approved.status, "allow");
  assert.ok(approved.reasons.some((reason) => reason.code === "HUMAN_APPROVAL_ACCEPTED"));
  assert.equal(engine.snapshot.cumulativeSpent, "700");
});

test("detects tampering with a hash-linked audit record", async () => {
  const { engine, auditLog, makeAction } = setup();
  await engine.evaluate(makeAction(), { now: NOW });
  assert.equal((await auditLog.verify()).valid, true);

  const original = auditLog.records[0];
  const tampered = [{ ...original, details: { ...original.details, status: "deny" } }];
  const verification = await TamperEvidentAuditLog.verifyRecords(tampered);
  assert.equal(verification.valid, false);
  assert.equal(verification.failingSequence, 1);
});

test("enforces policy expiration", async () => {
  const { engine, makeAction } = setup({ policyOverrides: { expiresAt: NOW } });
  const decision = await engine.evaluate(makeAction(), { now: NOW });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "POLICY_EXPIRED"));
});

test("enforces the maximum transaction count", async () => {
  const { engine, makeAction } = setup({ policyOverrides: { maxTransactionCount: 1 } });
  assert.equal((await engine.evaluate(makeAction(), { now: NOW })).status, "allow");
  const decision = await engine.evaluate(makeAction({ requestId: "test-request-002" }), { now: NOW + 1 });
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((reason) => reason.code === "TRANSACTION_COUNT_LIMIT_EXCEEDED"));
});

test("serializes concurrent evaluations so cumulative limits cannot race", async () => {
  const { engine, makeAction } = setup({ policyOverrides: { cumulativeSpendingLimit: 150n } });
  const results = await Promise.all([
    engine.evaluate(makeAction({ requestId: "parallel-1" }), { now: NOW }),
    engine.evaluate(makeAction({ requestId: "parallel-2" }), { now: NOW }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["allow", "deny"]);
  assert.equal(engine.snapshot.cumulativeSpent, "100");
});
