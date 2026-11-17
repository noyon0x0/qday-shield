import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { createDemoPolicy, createFakeTestIdentity, SecurityPolicyEngine, type SimulatedTransfer } from "../src/security/index.js";
import type { AuditRecord, JsonObject } from "../src/security/types.js";
import { FileAuditStore } from "./auditStore.js";
import type { ApprovalRequest, DecisionResponse, EmergencyPauseRequest, PolicyResponse, QoreChainObservationResponse, SimulatedActionRequest } from "./contracts.js";

export interface ApiConfig { host: string; port: number; auditDirectory: string; demoMode: boolean; allowRemote: boolean; token?: string; }
interface PendingAction { action: SimulatedTransfer; }
class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const MAX_BODY_BYTES = 8_192;
const BASE_TIME = Date.UTC(2026, 0, 1);

export function loadApiConfig(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): ApiConfig {
  const host = env.QDAY_API_HOST || "127.0.0.1";
  const port = env.QDAY_API_PORT === undefined ? 4174 : Number(env.QDAY_API_PORT);
  const allowRemote = env.QDAY_ALLOW_REMOTE === "true";
  const token = env.QDAY_API_TOKEN;
  const auditDirectory = resolve(cwd, env.QDAY_AUDIT_DIR || ".qday-data");
  const webRoots = [resolve(cwd, "public"), resolve(cwd, "dist")];
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("QDAY_API_PORT must be an integer between 1 and 65535.");
  if (webRoots.some((root) => auditDirectory === root || auditDirectory.startsWith(`${root}/`) || auditDirectory.startsWith(`${root}\\`))) {
    throw new Error("QDAY_AUDIT_DIR must not be inside a web-served directory.");
  }
  if (allowRemote && (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token))) throw new Error("Remote API access requires QDAY_API_TOKEN with 32 to 256 URL-safe characters.");
  if (!allowRemote && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") throw new Error("Non-loopback bind requires QDAY_ALLOW_REMOTE=true and a strong API token.");
  return Object.freeze({ host, port, auditDirectory, demoMode: env.QDAY_DEMO_MODE !== "false", allowRemote, token });
}

export function createQDayApi(options: { config?: ApiConfig; auditStore?: FileAuditStore; clock?: () => number } = {}) {
  const config = options.config ?? loadApiConfig();
  const clock = options.clock ?? Date.now;
  const store = options.auditStore ?? new FileAuditStore(config.auditDirectory);
  const identity = createFakeTestIdentity("Q-Day local fake identity");
  const policy = createDemoPolicy(Number.MAX_SAFE_INTEGER);
  const pending = new Map<string, PendingAction>();
  const rate = new Map<string, { start: number; count: number }>();
  let engine: SecurityPolicyEngine;

  const initialize = async (): Promise<void> => {
    const verification = await store.initialize();
    engine = new SecurityPolicyEngine(policy, undefined, store);
    if (verification.valid) engine.restoreFromAudit(await store.list(1_000_000).then((rows) => [...rows].reverse()));
  };

  const route = async (method: string, url: URL, body: unknown, remoteAddress: string, token?: string): Promise<{ status: number; payload: unknown }> => {
    const now = Math.max(BASE_TIME, clock());
    const snapshot = store ? await store.verify() : { valid: false, recordsChecked: 0 };
    if (!snapshot.valid) storeWritable = false;
    if (method === "GET" && url.pathname === "/api/health") return { status: snapshot.valid ? 200 : 503, payload: { status: snapshot.valid ? "ok" : "audit-integrity-error", mode: config.demoMode ? "DEMO MODE" : "SIMULATION ONLY", audit: snapshot } };
    if (method === "GET" && url.pathname === "/api/observations/qorechain") {
      const payload: QoreChainObservationResponse = { source: "qorechain-testnet", state: "not-collected", message: "This backend does not collect or invent QoreChain network observations." };
      return { status: 200, payload };
    }
    if (method === "GET" && url.pathname === "/api/policies") {
      const payload: PolicyResponse = { source: "demo-policy", mode: "DEMO MODE", allowedRecipients: policy.allowedRecipients, ...engine.snapshot };
      return { status: 200, payload };
    }
    if (method === "GET" && url.pathname === "/api/audit/verify") return { status: snapshot.valid ? 200 : 409, payload: snapshot };
    if (method === "GET" && url.pathname === "/api/audit/events") {
      authorizeSensitive("audit-read", remoteAddress, now, token);
      if ([...url.searchParams.keys()].some((key) => key !== "limit") || url.searchParams.getAll("limit").length > 1) throw new ApiError(400, "Only one limit query parameter is accepted.");
      const limitText = url.searchParams.get("limit") ?? "100";
      if (!/^\d{1,4}$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 500) throw new ApiError(400, "limit must be an integer from 1 to 500.");
      return { status: 200, payload: { source: "demo-audit", events: await store.list(Number(limitText)) } };
    }

    if (method === "PATCH" && url.pathname === "/api/policies/emergency-pause") {
      authorizeSensitive("pause", remoteAddress, now, token);
      const input = strictObject(body, ["paused", "operator"]) as unknown as EmergencyPauseRequest;
      if (typeof input.paused !== "boolean" || input.operator !== "demo-operator") throw new ApiError(400, "Expected paused:boolean and operator: demo-operator.");
      await engine.setEmergencyPause(input.paused, { now, changedBy: input.operator });
      return { status: 200, payload: { source: "demo-control", emergencyPaused: engine.isEmergencyPaused } };
    }

    if (method === "POST" && url.pathname === "/api/security/decisions") {
      authorizeSensitive("decision", remoteAddress, now, token);
      const action = parseAction(body, false, identity);
      const decision = await engine.evaluate(action, { now });
      if (decision.status === "requires-approval") pending.set(action.requestId, { action });
      const payload: DecisionResponse = { source: "demo-simulation", decision };
      return { status: 200, payload };
    }

    const approvalMatch = /^\/api\/security\/decisions\/([^/]+)\/approval$/.exec(url.pathname);
    if (method === "POST" && approvalMatch) {
      authorizeSensitive("approval", remoteAddress, now, token);
      const requestId = approvalMatch[1];
      const input = strictObject(body, ["approvedBy", "decision"]) as unknown as ApprovalRequest;
      if (input.approvedBy !== "demo-approver" || input.decision !== "approved") throw new ApiError(400, "Expected approvedBy: demo-approver and decision: approved.");
      const waiting = pending.get(requestId);
      if (!waiting) throw new ApiError(404, "No pending simulated approval exists for this request.");
      const action = { ...waiting.action, approval: { decision: "approved" as const, requestId, actionFingerprint: JSON.stringify([waiting.action.kind, waiting.action.requestId, waiting.action.actor.identity.identityId, waiting.action.actor.signingMode, waiting.action.actor.keyState, waiting.action.recipient, waiting.action.amount.toString(), waiting.action.authorizationExpiresAt]), approvedBy: input.approvedBy, approvedAt: now } };
      const decision = await engine.evaluate(action, { now });
      pending.delete(requestId);
      const payload: DecisionResponse = { source: "demo-simulation", decision };
      return { status: 200, payload };
    }

    if (method === "POST" && url.pathname === "/api/simulator/scenarios") {
      authorizeSensitive("scenario", remoteAddress, now, token);
      const action = parseAction(body, true, identity);
      const decision = await engine.evaluate(action, { now });
      return { status: 200, payload: { source: "demo-simulation", scenario: "classical-key-compromise", outcome: decision } };
    }
    throw new ApiError(404, "Route not found.");
  };

  function authorizeSensitive(kind: string, ip: string, now: number, supplied?: string): void {
    if (!storeIsWritable()) throw new ApiError(503, "Audit integrity is unavailable; sensitive operations are disabled.");
    if (config.allowRemote) {
      if (!config.token || !supplied || supplied.length !== config.token.length || !timingSafeEqual(BufferFrom(supplied), BufferFrom(config.token))) throw new ApiError(401, "API authentication required.");
    }
    const key = `${ip}:${kind}`;
    if (rate.size > 2_000) for (const [candidate, entry] of rate) if (now - entry.start >= 60_000) rate.delete(candidate);
    const window = rate.get(key);
    if (!window || now - window.start >= 60_000) rate.set(key, { start: now, count: 1 });
    else if (++window.count > 20) throw new ApiError(429, "Rate limit exceeded; retry after the current minute.");
  }

  let storeWritable = true;
  function storeIsWritable(): boolean { return storeWritable; }
  function BufferFrom(value: string): Uint8Array { return new TextEncoder().encode(value); }

  const server = createServer((request, response) => {
    void (async () => {
      try {
        const chunks: Uint8Array[] = [];
        let size = 0;
        let tooLarge = false;
        request.on("data", (chunk) => { size += chunk.byteLength; if (size > MAX_BODY_BYTES) tooLarge = true; else chunks.push(chunk); });
        await new Promise<void>((resolvePromise, reject) => {
          request.on("end", resolvePromise);
          request.on("error", reject);
        });
        if (tooLarge) throw new ApiError(413, "Request body exceeds 8 KB.");
        let body: unknown;
        if (size > 0) {
          if (!(request.headers["content-type"] ?? "").toString().toLowerCase().startsWith("application/json")) throw new ApiError(415, "Content-Type must be application/json.");
          try { body = JSON.parse(new TextDecoder().decode(concat(chunks, size))); }
          catch { throw new ApiError(400, "Request body must be valid JSON."); }
        }
        const token = request.headers["authorization"];
        const parsedToken = Array.isArray(token) ? undefined : token?.startsWith("Bearer ") ? token.slice(7) : undefined;
        const address = server.address();
        const url = new URL(request.url ?? "/", `http://${typeof address === "object" && address ? address.address : "127.0.0.1"}`);
        if (url.pathname !== "/api/audit/events" && [...url.searchParams.keys()].length > 0) throw new ApiError(400, "This endpoint does not accept query parameters.");
        if ((request.method === "GET" || request.method === "HEAD") && size > 0) throw new ApiError(400, "Read endpoints do not accept a request body.");
        const result = await route(request.method ?? "GET", url, body, request.socket.remoteAddress ?? "unknown", parsedToken);
        send(response, result.status, result.payload);
      } catch (error) {
        if (error instanceof ApiError) send(response, error.status, { error: error.message });
        else if (error instanceof SyntaxError || error instanceof TypeError) send(response, 400, { error: "Request validation failed." });
        else {
          // Never log request bodies, headers, credentials, keys, or exception objects.
          storeWritable = false;
          send(response, 503, { error: "Operation could not be completed safely." });
        }
      }
    })();
  });
  return { server, store, initialize, get engine() { return engine; }, config };
}

function strictObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ApiError(400, "Request body must be an object.");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !allowed.includes(key))) throw new ApiError(400, "Request contains unsupported fields.");
  return object;
}
function parseAction(body: unknown, compromised: boolean, identity: ReturnType<typeof createFakeTestIdentity>): SimulatedTransfer {
  const input = strictObject(body, ["requestId", "recipient", "amount", "authorizationExpiresAt", "signerMode"]) as unknown as SimulatedActionRequest;
  if (typeof input.requestId !== "string" || !/^demo-[a-z0-9-]{1,24}$/.test(input.requestId)) throw new ApiError(400, "requestId must be a demo-prefixed identifier.");
  if (typeof input.recipient !== "string" || !/^qday-demo:\/\/recipient\/[a-z0-9-]{1,48}$/.test(input.recipient)) throw new ApiError(400, "recipient must use a qday-demo:// recipient identifier.");
  if (typeof input.amount !== "string" || !/^(0|[1-9]\d{0,17})$/.test(input.amount)) throw new ApiError(400, "amount must be a non-negative integer string of at most 18 digits.");
  if (typeof input.authorizationExpiresAt !== "number" || !Number.isSafeInteger(input.authorizationExpiresAt)) throw new ApiError(400, "authorizationExpiresAt must be an integer timestamp.");
  if (input.signerMode !== "hybrid-test" && input.signerMode !== "classical-compromise") throw new ApiError(400, "signerMode must be hybrid-test or classical-compromise.");
  if (compromised && input.signerMode !== "classical-compromise") throw new ApiError(400, "This scenario requires the simulated classical-compromise signer mode.");
  return Object.freeze({ kind: "simulated-outgoing-transfer", requestId: input.requestId, recipient: input.recipient, amount: BigInt(input.amount), authorizationExpiresAt: input.authorizationExpiresAt, actor: Object.freeze({ identity, signingMode: input.signerMode === "hybrid-test" ? "hybrid-test" : "classical-secp256k1", keyState: compromised || input.signerMode === "classical-compromise" ? "compromised-simulated" : "test-only" }) });
}
function concat(chunks: readonly Uint8Array[], size: number): Uint8Array { const output = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; } return output; }
function send(response: import("node:http").ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(payload));
}

export type { AuditRecord };
