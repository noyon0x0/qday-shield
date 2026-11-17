export { TamperEvidentAuditLog } from "./auditLog.js";
export {
  SecurityPolicyEngine,
  actionFingerprint,
  createDemoPolicy,
  createHumanApproval,
  type PolicyAuditSink,
} from "./policyEngine.js";
export {
  assertFakeIdentity,
  createFakeTestIdentity,
  createSimulatedTransfer,
  createUncompromisedTestActor,
  isFakeTestIdentity,
  simulateClassicalKeyCompromise,
} from "./simulation.js";
export type {
  AuditRecord,
  AuditVerification,
  DecisionStatus,
  HumanApproval,
  PolicyDecision,
  PolicyEngineSnapshot,
  RiskCode,
  RiskReason,
  RiskSeverity,
  SecurityPolicy,
  SimulatedActor,
  SimulatedTransfer,
  TestIdentity,
} from "./types.js";
