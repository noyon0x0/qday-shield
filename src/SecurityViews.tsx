import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  GlassPanel,
  Icon,
  SectionHeading,
  SecurityTimeline,
  StatusDot,
  type TimelineEvent,
} from "./components.js";
import type {
  AuditRecord,
  AuditVerification,
  PolicyDecision,
  PolicyEngineSnapshot,
  SimulatedTransfer,
  TamperEvidentAuditLog,
} from "./security/index.js";

const localDisplayEvents: TimelineEvent[] = [
  { time: "09:42:18", kind: "POLICY", title: "Spending threshold evaluated", detail: "Illustrative event · approval review", tone: "amber" },
  { time: "09:38:04", kind: "NETWORK", title: "Testnet monitor initialized", detail: "Read-only session · demo feed", tone: "cyan" },
  { time: "09:31:52", kind: "SIMULATION", title: "Classical key scenario contained", detail: "Illustrative event · no cryptographic attack performed", tone: "green" },
  { time: "09:16:10", kind: "POLICY", title: "Allowlist rule reviewed", detail: "Static sample event · not a policy decision", tone: "violet" },
];

export function SecuritySimulatorPage(props: {
  decision: PolicyDecision | null;
  lastAction: SimulatedTransfer | null;
  running: boolean;
  error: string | null;
  run: (replay?: boolean) => void;
}): JSX.Element {
  const decision = props.decision;
  const statusTone = decision?.status === "allow" ? "green" : decision?.status === "deny" ? "red" : decision?.status === "requires-approval" ? "amber" : "neutral";
  return <div className="sim-layout">
    <Card className="sim-main">
      <SectionHeading title="Classical key exposure" subtitle="Deterministic policy exercise · test identity only" action={<Badge tone="demo">SIMULATED</Badge>} />
      <div className="scenario-callout"><div className="scenario-orbit"><Icon name="crosshair" size={24} /></div><div><span className="eyebrow">SCENARIO · FAKE TEST IDENTITY</span><h2>Model a classical signing key compromise.</h2><p>The simulator labels a fabricated test identity as compromised and evaluates a proposed transfer locally. No key material exists, no wallet is accessed, and no transaction is submitted.</p></div></div>
      <div className="sim-identity-strip"><span><Icon name="key" size={14} />TEST IDENTITY</span><code>{props.lastAction?.actor.identity.displayAddress ?? "qday-demo://identity/classical-scenario"}</code><Badge tone="red">COMPROMISE SIMULATED</Badge></div>
      <div className="scenario-flow">
        <div className="flow-step"><span className="flow-index">01</span><span><strong>Classical key exposure</strong><small>secp256k1 · test-only compromise marker</small></span><Badge tone="red">SIMULATED</Badge></div><div className="flow-connector" />
        <div className="flow-step"><span className="flow-index">02</span><span><strong>Outgoing action</strong><small>{props.lastAction ? props.lastAction.amount.toString() + " demo units · " + props.lastAction.recipient : "2,400 demo units · unrecognized test recipient"}</small></span><Badge tone="neutral">LOCAL ONLY</Badge></div><div className="flow-connector" />
        <div className={"flow-step " + (decision ? "flow-complete" : "")}><span className="flow-index">03</span><span><strong>Deterministic policy decision</strong><small>{decision?.explanation ?? "Awaiting local policy evaluation"}</small></span><Badge tone={statusTone}>{decision?.status.replace("-", " ").toUpperCase() ?? "PENDING"}</Badge></div>
      </div>
      <div className={"decision-panel " + (decision ? "decision-complete" : "")} aria-live="polite" role="status"><span className="decision-glyph"><Icon name={decision?.status === "allow" ? "check" : decision?.status === "deny" ? "ban" : "sliders"} size={18} /></span><div><span className="eyebrow">POLICY ENGINE RESULT</span><strong>{decision ? decision.status.replace("-", " ").toUpperCase() : "Ready to evaluate sample action"}</strong><small>{decision?.explanation ?? "This action is evaluated by the local policy engine and recorded in the tamper-evident demo audit chain."}</small></div>{decision && <Badge tone={statusTone}>{decision.reasons.length} RISK REASONS</Badge>}</div>
      {decision && decision.reasons.length > 0 && <div className="decision-reasons">{decision.reasons.map((reason, index) => <div className="decision-reason" key={reason.code + "-" + index}><Badge tone={reason.severity === "critical" || reason.severity === "high" ? "red" : reason.severity === "medium" ? "amber" : "cyan"}>{reason.severity.toUpperCase()}</Badge><div><strong>{reason.code.replaceAll("_", " ")}</strong><small>{reason.message}</small></div></div>)}</div>}
      {props.error && <div className="read-error" role="alert"><StatusDot tone="red" /><div><strong>Simulation audit write failed</strong><span>{props.error}</span></div></div>}
      <div className="sim-actions"><Button className="run-simulation" icon="play" onClick={() => props.run(false)} disabled={props.running}>{props.running ? "Evaluating policy…" : decision ? "Run new scenario" : "Evaluate demo scenario"}</Button>{props.lastAction && <Button variant="secondary" icon="refresh" onClick={() => props.run(true)} disabled={props.running}>Replay same request</Button>}</div>
    </Card>
    <div className="sim-side">
      <Card><SectionHeading title="Scenario inputs" subtitle="Deterministic fake values" /><div className="input-list"><InfoRow label="Identity" value="Fake Q-Day local demo" /><InfoRow label="Key algorithm" value="secp256k1 (simulated)" /><InfoRow label="Action" value="Outgoing transfer model" /><InfoRow label="Amount" value="2,400 demo units" /><InfoRow label="Recipient" value="Unrecognized fake URI" /></div></Card>
      <Card className="risk-explanation"><SectionHeading title="Policy evaluation" subtitle="Rules evaluated in fixed order" /><div className="risk-factor"><span className="risk-factor-icon"><Icon name="key" size={14} /></span><div><strong>Compromised classical key</strong><small>Classical-only signing is denied by the demo policy.</small></div><Badge tone="red">DENY</Badge></div><div className="risk-factor"><span className="risk-factor-icon"><Icon name="users" size={14} /></span><div><strong>Recipient allowlist</strong><small>Unknown fake recipient cannot proceed.</small></div><Badge tone="red">DENY</Badge></div><div className="risk-factor"><span className="risk-factor-icon amber-factor"><Icon name="gauge" size={14} /></span><div><strong>High-risk amount</strong><small>Approval is evaluated only when earlier deny rules pass.</small></div><Badge tone="amber">REVIEW</Badge></div></Card>
      <Card className="warning-card"><Icon name="info" size={17} /><div><strong>Simulation boundary</strong><p>Local deterministic policy output does not prove QoreChain or any on-chain protection.</p></div></Card>
    </div>
  </div>;
}

export function PolicyCenterPage(props: { snapshot: PolicyEngineSnapshot; togglePause: () => void; controlError: string | null }): JSX.Element {
  const { snapshot } = props;
  const rows = [
    { icon: "users", title: "Recipient allowlist", detail: "Only exact demo recipients pass this rule.", state: "ENABLED", tone: "green" as const },
    { icon: "gauge", title: "Per-transaction limit", detail: "≤ " + snapshot.perTransactionLimit + " demo units per action.", state: "ENABLED", tone: "green" as const },
    { icon: "wallet", title: "Cumulative spending limit", detail: snapshot.cumulativeSpent + " used · " + snapshot.cumulativeRemaining + " demo units remain.", state: "ACTIVE", tone: "cyan" as const },
    { icon: "usercheck", title: "Human approval", detail: "Required at or above " + snapshot.approvalThreshold + " demo units.", state: "REQUIRED", tone: "amber" as const },
    { icon: "pause", title: "Emergency pause", detail: "Denies every outgoing simulated action while active.", state: snapshot.emergencyPaused ? "PAUSED" : "READY", tone: snapshot.emergencyPaused ? "red" as const : "cyan" as const },
  ];
  return <>
    <div className="demo-banner"><div className="banner-icon"><Icon name="info" size={18} /></div><div><strong>Local deterministic policy engine</strong><span>Controls affect only fake test actions in this browser session; they do not configure on-chain protections.</span></div><Badge tone="demo">SIMULATED</Badge></div>
    <div className="policy-grid"><Card><SectionHeading title="Active demo policy" subtitle="Enforced by the local security core" action={<Badge tone="neutral">{snapshot.policyId}</Badge>} /><div className="policy-list">{rows.map((row, index) => <div className="policy-row" key={row.title}><span className={"policy-icon tone-" + row.tone}><Icon name={row.icon} size={17} /></span><div className="policy-copy"><strong>{row.title}</strong><span>{row.detail}</span></div><Badge tone={row.tone}>{row.state}</Badge><span className="policy-order">{String(index + 1).padStart(2, "0")}</span></div>)}</div><div className="policy-control"><div><strong>Emergency pause</strong><small>{snapshot.emergencyPaused ? "All outgoing simulated actions are denied." : "Simulation actions are checked against policy."}</small></div><Button variant={snapshot.emergencyPaused ? "primary" : "secondary"} icon={snapshot.emergencyPaused ? "play" : "pause"} onClick={props.togglePause}>{snapshot.emergencyPaused ? "Resume demo policy" : "Pause outgoing actions"}</Button></div>{props.controlError && <div className="read-error" role="alert"><StatusDot tone="red" /><div><strong>Policy control failed</strong><span>{props.controlError}</span></div></div>}</Card>
      <Card><SectionHeading title="Evaluation order" subtitle="Ordered deny gates; approval follows only when all pass" /><div className="evaluation-list"><Evaluation index="01" title="Emergency pause" result="Deny every outgoing action" /><Evaluation index="02" title="Request and authorization" result="Reject expired or replayed requests" /><Evaluation index="03" title="Signer posture" result="Reject simulated classical compromise" /><Evaluation index="04" title="Recipient allowlist" result="Unknown destination → deny" /><Evaluation index="05" title="Spending and count" result="Enforce individual, cumulative, and count caps" /><Evaluation index="06" title="Human approval" result="Require review at the configured threshold" /></div><div className="card-footnote"><Icon name="lock" size={13} />Policy decisions and pause changes are appended to the local SHA-256 hash chain.</div></Card></div>
    <div className="policy-runtime"><span><StatusDot tone={snapshot.emergencyPaused ? "red" : "green"} />{snapshot.emergencyPaused ? "PAUSED · SIMULATED" : "SIMULATED"}</span><span>{snapshot.transactionsUsed} / {snapshot.maxTransactionCount} simulated actions used</span><span>Policy expiry: {new Date(snapshot.policyExpiresAt).toLocaleString()}</span></div>
  </>;
}

export function SecurityAuditPage(props: { auditLog: TamperEvidentAuditLog; revision: number }): JSX.Element {
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [checking, setChecking] = useState(false);
  const records = props.auditLog.records;
  useEffect(() => setVerification(null), [props.revision]);
  async function verifyAudit(): Promise<void> {
    setChecking(true);
    try { setVerification(await props.auditLog.verify()); }
    finally { setChecking(false); }
  }
  return <>
    <div className="audit-summary"><div><span className="eyebrow">LOCAL DECISION JOURNAL</span><strong>{records.length.toString().padStart(2, "0")}</strong><span>policy and control records</span></div><Badge tone="demo"><Icon name="info" size={12} /> SIMULATED · NOT ON-CHAIN</Badge></div>
    <GlassPanel><SectionHeading title="Policy decisions and controls" subtitle="SHA-256 linked records · stored in this page session" action={<div className="audit-actions"><Button icon="check" variant="secondary" onClick={() => void verifyAudit()} disabled={checking}>{checking ? "Verifying…" : "Verify local chain"}</Button>{verification && <Badge tone={verification.valid ? "green" : "red"}>{verification.valid ? "LOCAL LOG VALID" : "TAMPER DETECTED"}</Badge>}</div>} />
      {verification && <div className={"verification-result " + (verification.valid ? "verification-ok" : "verification-failed")} role="status"><StatusDot tone={verification.valid ? "green" : "red"} /><span>{verification.valid ? "Verified " + verification.recordsChecked + " records; local contents match their hash chain." : "Record " + (verification.failingSequence ?? "?") + " failed verification: " + verification.reason}</span></div>}
      {records.length === 0 ? <EmptyState icon="database" title="No decisions recorded yet" detail="Run the local attack simulation or change the demo pause control to create audit records." /> : <div className="event-list audit-live-list">{records.slice().reverse().map((record) => <AuditEvent key={record.sequence} record={record} />)}</div>}
    </GlassPanel>
    <GlassPanel className="static-audit-card"><SectionHeading title="Illustrative sample feed" subtitle="Static presentation content · separate from policy-engine records" action={<Badge tone="neutral">MOCK DATA</Badge>} /><SecurityTimeline events={localDisplayEvents} /></GlassPanel>
    <p className="disclaimer">Hash linking makes edits detectable while these local records remain intact. This session-only log is not immutable storage, an external backup, or proof of on-chain protection.</p>
  </>;
}

function AuditEvent({ record }: { record: AuditRecord }): JSX.Element {
  const isDecision = record.eventType === "decision";
  const status = String(record.details.status ?? "");
  const paused = record.details.paused === true;
  const tone = isDecision ? status === "allow" ? "green" : status === "deny" ? "red" : "amber" : "violet";
  const title = isDecision ? "Simulated action · " + status.toUpperCase() : "Emergency pause " + (paused ? "engaged" : "released");
  const detail = isDecision
    ? String(record.details.explanation ?? "Policy decision recorded") + " · " + String(record.details.requestId ?? "")
    : "Changed by " + String(record.details.changedBy ?? "demo operator");
  return <div className="event-row audit-record"><span className={"event-marker tone-" + tone} /><span className="event-time">{new Date(record.occurredAt).toLocaleTimeString()}</span><span className="event-body"><span className="event-kind">{isDecision ? "LOCAL POLICY DECISION" : "POLICY CONTROL"} · #{record.sequence}</span><strong>{title}</strong><small>{detail}</small><code className="audit-hash">SHA-256 · {record.hash.slice(0, 20)}…</code></span><Badge tone={tone}>{isDecision ? status.toUpperCase() : paused ? "PAUSED" : "RESUMED"}</Badge></div>;
}

function InfoRow(props: { label: string; value: string }): JSX.Element { return <div className="info-row"><span>{props.label}</span><strong title={props.value}>{props.value}</strong></div>; }
function Evaluation(props: { index: string; title: string; result: string }): JSX.Element { return <div className="evaluation-row"><span>{props.index}</span><div><strong>{props.title}</strong><small>{props.result}</small></div><Icon name="chevron" size={14} /></div>; }
