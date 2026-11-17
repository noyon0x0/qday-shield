import { TamperEvidentAuditLog } from "./auditLog.js";
import { isFakeTestIdentity } from "./simulation.js";
import type {
  AuditRecord,
  HumanApproval,
  JsonObject,
  PolicyDecision,
  PolicyEngineSnapshot,
  RiskCode,
  RiskReason,
  SecurityPolicy,
  SimulatedTransfer,
} from "./types.js";

export interface EvaluationContext {
  /** Required caller-supplied clock value makes policy evaluation deterministic. */
  readonly now: number;
}

export interface PolicyAuditSink {
  append(event: { eventType: AuditRecord["eventType"]; occurredAt: number; details: JsonObject }): Promise<unknown>;
}

export class SecurityPolicyEngine {
  readonly auditLog: TamperEvidentAuditLog;
  private readonly policy: SecurityPolicy;
  private readonly allowedRecipients: ReadonlySet<string>;
  private readonly persistentAuditSink?: PolicyAuditSink;
  private emergencyPaused = false;
  private cumulativeSpent = 0n;
  private transactionsUsed = 0;
  private readonly completedRequests = new Set<string>();
  private readonly pendingApprovals = new Map<string, string>();
  private operationQueue: Promise<void> = Promise.resolve();
  private hasRun = false;

  constructor(policy: SecurityPolicy, auditLog = new TamperEvidentAuditLog(), persistentAuditSink?: PolicyAuditSink) {
    validatePolicy(policy);
    this.policy = Object.freeze({ ...policy, allowedRecipients: Object.freeze([...policy.allowedRecipients]) });
    this.allowedRecipients = new Set(policy.allowedRecipients);
    this.auditLog = auditLog;
    this.persistentAuditSink = persistentAuditSink;
  }

  get isEmergencyPaused(): boolean {
    return this.emergencyPaused;
  }

  get snapshot(): PolicyEngineSnapshot {
    const remaining = this.policy.cumulativeSpendingLimit - this.cumulativeSpent;
    return Object.freeze({
      policyId: this.policy.policyId,
      emergencyPaused: this.emergencyPaused,
      cumulativeSpent: this.cumulativeSpent.toString(),
      transactionsUsed: this.transactionsUsed,
      maxTransactionCount: this.policy.maxTransactionCount,
      transactionsRemaining: Math.max(this.policy.maxTransactionCount - this.transactionsUsed, 0),
      perTransactionLimit: this.policy.perTransactionLimit.toString(),
      cumulativeSpendingLimit: this.policy.cumulativeSpendingLimit.toString(),
      approvalThreshold: this.policy.approvalThreshold.toString(),
      cumulativeRemaining: (remaining > 0n ? remaining : 0n).toString(),
      policyExpiresAt: this.policy.expiresAt,
    });
  }

  /** Restore counters, pause state, and replay identifiers from a verified prior audit chain. */
  restoreFromAudit(records: readonly Pick<AuditRecord, "eventType" | "occurredAt" | "details">[]): void {
    if (this.hasRun || this.auditLog.records.length > 0 || this.transactionsUsed > 0 || this.emergencyPaused) {
      throw new Error("Policy state can only be restored before the engine processes requests.");
    }
    for (const record of records) {
      if (record.details.policyId !== this.policy.policyId) continue;
      if (record.eventType === "control" && record.details.control === "emergency-pause") {
        this.emergencyPaused = record.details.paused === true;
      }
      if (record.eventType !== "decision") continue;
      const requestId = typeof record.details.requestId === "string" ? record.details.requestId : "";
      const status = record.details.status;
      if (!requestId) continue;
      if (status === "requires-approval") {
        this.pendingApprovals.set(requestId, typeof record.details.actionFingerprint === "string" ? record.details.actionFingerprint : "restored-pending-approval");
      } else {
        this.completedRequests.add(requestId);
      }
      if (status === "allow") {
        const amount = record.details.amount;
        if (typeof amount !== "string" || !/^\d+$/.test(amount)) throw new Error("Cannot restore malformed approved amount from audit history.");
        this.cumulativeSpent += BigInt(amount);
        this.transactionsUsed += 1;
      }
    }
  }

  setEmergencyPause(paused: boolean, input: { now: number; changedBy: string }): Promise<void> {
    return this.serialize(() => this.setEmergencyPauseInQueue(paused, input));
  }

  private async setEmergencyPauseInQueue(paused: boolean, input: { now: number; changedBy: string }): Promise<void> {
    this.hasRun = true;
    if (!Number.isFinite(input.now) || !input.changedBy.trim()) throw new TypeError("Pause changes require a timestamp and operator label.");
    if (paused === this.emergencyPaused) return;
    const event: { eventType: AuditRecord["eventType"]; occurredAt: number; details: JsonObject } = {
      eventType: "control",
      occurredAt: input.now,
      details: { policyId: this.policy.policyId, control: "emergency-pause", paused, changedBy: input.changedBy.trim() },
    };
    // Engage the pause immediately; require an audit write before clearing it.
    if (paused) this.emergencyPaused = true;
    await this.persistentAuditSink?.append(event);
    await this.auditLog.append(event);
    if (!paused) this.emergencyPaused = false;
  }

  evaluate(action: SimulatedTransfer, context: EvaluationContext): Promise<PolicyDecision> {
    return this.serialize(() => { this.hasRun = true; return this.evaluateInQueue(action, context); });
  }

  private async evaluateInQueue(action: SimulatedTransfer, context: EvaluationContext): Promise<PolicyDecision> {
    if (!Number.isFinite(context.now)) throw new TypeError("Evaluation requires a finite caller-supplied timestamp.");
    const requestId = typeof action.requestId === "string" ? action.requestId.trim() : "";
    const amount = typeof action.amount === "bigint" ? action.amount : 0n;
    const recipient = typeof action.recipient === "string" ? action.recipient.trim() : "";
    const reasons: RiskReason[] = [];
    const fingerprint = actionFingerprint(action);
    const pendingFingerprint = requestId ? this.pendingApprovals.get(requestId) : undefined;
    const hasApproval = action.approval !== undefined;

    if (!requestId || this.completedRequests.has(requestId) || (pendingFingerprint !== undefined && !hasApproval)) {
      reasons.push(this.reason("REPLAY_ATTEMPT", "high", "This request identifier has already been evaluated or is awaiting its single approval continuation."));
      return this.recordDecision(action, context.now, "deny", reasons, "Replay attempt denied.");
    }

    let approvalResumption = false;
    if (pendingFingerprint !== undefined && hasApproval) {
      if (!this.isValidApproval(action, context.now, pendingFingerprint)) {
        reasons.push(this.reason("HUMAN_APPROVAL_INVALID", "high", "Approval does not match the pending request, action payload, approver, or evaluation time."));
        return this.recordDecision(action, context.now, "deny", reasons, "Invalid approval denied; the pending request remains available for review.");
      }
      approvalResumption = true;
      this.pendingApprovals.delete(requestId);
    } else if (hasApproval) {
      reasons.push(this.reason("HUMAN_APPROVAL_INVALID", "high", "No matching pending high-risk request exists for this approval."));
      this.completedRequests.add(requestId);
      return this.recordDecision(action, context.now, "deny", reasons, "Unsolicited approval denied.");
    }

    if (this.emergencyPaused) reasons.push(this.reason("ENGINE_PAUSED", "critical", "Emergency pause is active; outgoing simulated actions are denied."));
    if (context.now >= this.policy.expiresAt) reasons.push(this.reason("POLICY_EXPIRED", "high", "The security policy has expired."));
    if (!Number.isFinite(action.authorizationExpiresAt) || context.now >= action.authorizationExpiresAt) {
      reasons.push(this.reason("AUTHORIZATION_EXPIRED", "high", "The request authorization window has expired."));
    }
    if (!action.actor || !isFakeTestIdentity(action.actor.identity)) {
      reasons.push(this.reason("IDENTITY_NOT_TEST_ONLY", "critical", "Only identities created by the local fake-test identity factory are accepted."));
    } else {
      if (action.actor.keyState === "compromised-simulated") {
        reasons.push(this.reason("CLASSICAL_KEY_COMPROMISED_SIMULATED", "critical", "A simulated compromised classical secp256k1 identity cannot authorize this action."));
      }
      if (action.actor.signingMode === "classical-secp256k1") {
        reasons.push(this.reason("CLASSICAL_SIGNATURE_NOT_AUTHORIZED", "high", "A classical-only signature is not sufficient for this policy."));
      }
    }
    if (!this.allowedRecipients.has(recipient)) reasons.push(this.reason("UNKNOWN_RECIPIENT", "high", "Recipient is not present in the policy allowlist."));
    if (amount <= 0n) reasons.push(this.reason("INVALID_AMOUNT", "high", "Transfer amount must be a positive integer in the policy base unit."));
    else {
      if (amount > this.policy.perTransactionLimit) {
        reasons.push(this.reason("PER_TRANSACTION_LIMIT_EXCEEDED", "high", "Amount exceeds the per-transaction spending limit."));
      }
      if (this.cumulativeSpent + amount > this.policy.cumulativeSpendingLimit) {
        reasons.push(this.reason("CUMULATIVE_SPENDING_LIMIT_EXCEEDED", "high", "Amount would exceed the remaining cumulative spending limit."));
      }
    }
    if (this.transactionsUsed >= this.policy.maxTransactionCount) {
      reasons.push(this.reason("TRANSACTION_COUNT_LIMIT_EXCEEDED", "high", "The policy transaction-count allowance has been exhausted."));
    }
    if (reasons.length > 0) {
      this.completedRequests.add(requestId);
      return this.recordDecision(action, context.now, "deny", reasons, reasons.map((reason) => reason.message).join(" "));
    }

    if (amount >= this.policy.approvalThreshold && !approvalResumption) {
      const approvalReason = this.reason("HUMAN_APPROVAL_REQUIRED", "medium", "This high-risk amount requires an explicit human approval continuation.");
      this.pendingApprovals.set(requestId, fingerprint);
      return this.recordDecision(action, context.now, "requires-approval", [approvalReason], approvalReason.message);
    }

    if (approvalResumption) {
      reasons.push(this.reason("HUMAN_APPROVAL_ACCEPTED", "info", "A matching human approval was recorded for this request."));
    }
    this.completedRequests.add(requestId);
    this.cumulativeSpent += amount;
    this.transactionsUsed += 1;
    const explanation = approvalResumption
      ? "Action allowed after its matching human approval; spending and count limits were reserved."
      : "Action allowed by the active allowlist, authorization, key-posture, and spending rules.";
    return this.recordDecision(action, context.now, "allow", reasons, explanation);
  }

  private isValidApproval(action: SimulatedTransfer, now: number, pendingFingerprint: string): boolean {
    const approval: HumanApproval | undefined = action.approval;
    return Boolean(
      approval &&
      approval.decision === "approved" &&
      approval.requestId === action.requestId &&
      approval.actionFingerprint === pendingFingerprint &&
      pendingFingerprint === actionFingerprint(action) &&
      approval.approvedBy.trim() &&
      approval.approvedBy !== action.actor.identity.identityId &&
      Number.isFinite(approval.approvedAt) &&
      approval.approvedAt <= now,
    );
  }

  private reason(code: RiskCode, severity: RiskReason["severity"], message: string): RiskReason {
    return Object.freeze({ code, severity, message, policyId: this.policy.policyId });
  }

  private async recordDecision(
    action: SimulatedTransfer,
    evaluatedAt: number,
    status: PolicyDecision["status"],
    reasons: readonly RiskReason[],
    explanation: string,
  ): Promise<PolicyDecision> {
    const requestId = typeof action.requestId === "string" ? action.requestId.trim() : "";
    const recipient = typeof action.recipient === "string" ? action.recipient.trim() : "";
    const amount = typeof action.amount === "bigint" ? action.amount.toString() : "0";
    const decision: PolicyDecision = Object.freeze({
      requestId,
      status,
      explanation,
      reasons: Object.freeze([...reasons]),
      evaluatedAt,
      policyId: this.policy.policyId,
      amount,
      recipient,
    });
    const auditEvent = {
      eventType: "decision",
      occurredAt: evaluatedAt,
      details: {
        policyId: this.policy.policyId,
        requestId,
        actionFingerprint: actionFingerprint(action),
        status,
        explanation,
        actorIdentity: action.actor?.identity?.identityId ?? "invalid-identity",
        signingMode: action.actor?.signingMode ?? "unknown",
        recipient,
        amount,
        reasons: reasons.map((reason) => ({ code: reason.code, severity: reason.severity, message: reason.message })),
      },
    } as const;
    await this.persistentAuditSink?.append(auditEvent);
    await this.auditLog.append(auditEvent);
    return decision;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

export function createDemoPolicy(expiresAt: number): SecurityPolicy {
  return Object.freeze({
    policyId: "qday-demo-policy-v1",
    allowedRecipients: Object.freeze(["qday-demo://recipient/treasury", "qday-demo://recipient/custody"]),
    perTransactionLimit: 1_000n,
    cumulativeSpendingLimit: 2_500n,
    maxTransactionCount: 5,
    approvalThreshold: 500n,
    expiresAt,
  });
}

/** A deterministic binding for the local approval continuation; it is not an authentication signature. */
export function actionFingerprint(action: SimulatedTransfer): string {
  return JSON.stringify([
    action.kind,
    action.requestId,
    action.actor.identity.identityId,
    action.actor.signingMode,
    action.actor.keyState,
    action.recipient,
    action.amount.toString(),
    action.authorizationExpiresAt,
  ]);
}

export function createHumanApproval(action: SimulatedTransfer, approvedBy: string, approvedAt: number): HumanApproval {
  return Object.freeze({
    decision: "approved",
    requestId: action.requestId,
    actionFingerprint: actionFingerprint(action),
    approvedBy: approvedBy.trim(),
    approvedAt,
  });
}

function validatePolicy(policy: SecurityPolicy): void {
  if (!policy.policyId.trim()) throw new TypeError("Policy id is required.");
  if (policy.allowedRecipients.some((recipient) => !recipient.trim())) throw new TypeError("Allowlist recipients must be non-empty.");
  if (new Set(policy.allowedRecipients).size !== policy.allowedRecipients.length) throw new TypeError("Allowlist recipients must be unique.");
  if (policy.perTransactionLimit < 0n || policy.cumulativeSpendingLimit < 0n || policy.approvalThreshold < 0n) {
    throw new TypeError("Spending limits cannot be negative.");
  }
  if (!Number.isSafeInteger(policy.maxTransactionCount) || policy.maxTransactionCount < 0) {
    throw new TypeError("Maximum transaction count must be a non-negative safe integer.");
  }
  if (!Number.isFinite(policy.expiresAt)) throw new TypeError("Policy expiry must be a finite timestamp.");
}
