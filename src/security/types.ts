export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type RiskSeverity = "info" | "low" | "medium" | "high" | "critical";
export type RiskCode =
  | "ENGINE_PAUSED"
  | "POLICY_EXPIRED"
  | "AUTHORIZATION_EXPIRED"
  | "IDENTITY_NOT_TEST_ONLY"
  | "CLASSICAL_KEY_COMPROMISED_SIMULATED"
  | "CLASSICAL_SIGNATURE_NOT_AUTHORIZED"
  | "UNKNOWN_RECIPIENT"
  | "INVALID_AMOUNT"
  | "PER_TRANSACTION_LIMIT_EXCEEDED"
  | "CUMULATIVE_SPENDING_LIMIT_EXCEEDED"
  | "TRANSACTION_COUNT_LIMIT_EXCEEDED"
  | "REPLAY_ATTEMPT"
  | "HUMAN_APPROVAL_REQUIRED"
  | "HUMAN_APPROVAL_INVALID"
  | "HUMAN_APPROVAL_ACCEPTED";

export interface RiskReason {
  readonly code: RiskCode;
  readonly severity: RiskSeverity;
  readonly message: string;
  readonly policyId: string;
}

export interface TestIdentity {
  readonly environment: "qday-local-demo";
  readonly identityId: string;
  /** Deliberately not a valid blockchain address; never accepted by a chain client. */
  readonly displayAddress: string;
  readonly label: string;
}

export interface SimulatedActor {
  readonly identity: TestIdentity;
  readonly signingMode: "classical-secp256k1" | "hybrid-test";
  readonly keyState: "test-only" | "compromised-simulated";
}

export interface SimulatedTransfer {
  readonly kind: "simulated-outgoing-transfer";
  readonly requestId: string;
  readonly actor: SimulatedActor;
  readonly recipient: string;
  readonly amount: bigint;
  /** Authorization is valid strictly before this timestamp (milliseconds since epoch). */
  readonly authorizationExpiresAt: number;
  readonly approval?: HumanApproval;
}

export interface HumanApproval {
  readonly decision: "approved";
  readonly requestId: string;
  readonly actionFingerprint: string;
  readonly approvedBy: string;
  readonly approvedAt: number;
}

export interface SecurityPolicy {
  readonly policyId: string;
  readonly allowedRecipients: readonly string[];
  readonly perTransactionLimit: bigint;
  readonly cumulativeSpendingLimit: bigint;
  readonly maxTransactionCount: number;
  readonly approvalThreshold: bigint;
  /** Policy authorization expires at this timestamp (milliseconds since epoch). */
  readonly expiresAt: number;
}

export type DecisionStatus = "allow" | "deny" | "requires-approval";

export interface PolicyDecision {
  readonly requestId: string;
  readonly status: DecisionStatus;
  readonly explanation: string;
  readonly reasons: readonly RiskReason[];
  readonly evaluatedAt: number;
  readonly policyId: string;
  readonly amount: string;
  readonly recipient: string;
}

export interface AuditRecord {
  readonly sequence: number;
  readonly eventType: "decision" | "control";
  readonly occurredAt: number;
  readonly details: JsonObject;
  readonly previousHash: string;
  readonly hash: string;
}

export interface AuditVerification {
  readonly valid: boolean;
  readonly recordsChecked: number;
  readonly failingSequence?: number;
  readonly reason?: string;
}

export interface PolicyEngineSnapshot {
  readonly policyId: string;
  readonly emergencyPaused: boolean;
  readonly cumulativeSpent: string;
  readonly transactionsUsed: number;
  readonly maxTransactionCount: number;
  readonly transactionsRemaining: number;
  readonly perTransactionLimit: string;
  readonly cumulativeSpendingLimit: string;
  readonly approvalThreshold: string;
  readonly cumulativeRemaining: string;
  readonly policyExpiresAt: number;
}
