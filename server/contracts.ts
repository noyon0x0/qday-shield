import type { AuditRecord, PolicyDecision, PolicyEngineSnapshot } from "../src/security/types.js";

export interface SimulatedActionRequest {
  requestId: string;
  recipient: `qday-demo://recipient/${string}`;
  amount: string;
  authorizationExpiresAt: number;
  signerMode: "hybrid-test" | "classical-compromise";
}
export interface EmergencyPauseRequest { paused: boolean; operator: "demo-operator"; }
export interface ApprovalRequest { approvedBy: "demo-approver"; decision: "approved"; }
export type ApiSource = "demo-policy" | "demo-simulation" | "demo-control" | "demo-audit" | "qorechain-testnet";
export interface PolicyResponse extends PolicyEngineSnapshot { source: "demo-policy"; mode: "DEMO MODE"; allowedRecipients: readonly string[]; }
export interface DecisionResponse { source: "demo-simulation"; decision: PolicyDecision; }
export interface AuditEventsResponse { source: "demo-audit"; events: readonly AuditRecord[]; }
export interface QoreChainObservationResponse { source: "qorechain-testnet"; state: "not-collected"; message: string; }
