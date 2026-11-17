import { Badge, Button, Card, EmptyState, Icon, SectionHeading, StatusDot } from "./components.js";
import type { QoreChainObservationSnapshot, Observation } from "./network/qorechainMonitor.js";
import { QORECHAIN_TESTNET } from "./network/qorechainMonitor.js";
import { EvmWindowDemo } from "./EvmWindowDemo.js";

export function QoreChainMonitorView(props: {
  snapshot: QoreChainObservationSnapshot | null;
  loading: boolean;
  error: string | null;
  address: string;
  setAddress: (address: string) => void;
  refresh: () => void;
  loadMoreTransactions: () => void;
  transactionPageLoading: boolean;
  transactionPageError: string | null;
}): JSX.Element {
  const snapshot = props.snapshot;
  const nativeVerified = snapshot?.chain.status === "available" && snapshot.chain.value.matchesExpectedNetwork;
  const evmVerified = snapshot?.evm.status === "available" && snapshot.evm.value.matchesExpectedNetwork;
  const identityVerified = nativeVerified && evmVerified;

  return <>
    <div className="monitor-status"><div className="monitor-orb"><Icon name="activity" size={22} /></div><div className="monitor-copy"><span className="eyebrow">READ-ONLY NETWORK OBSERVATION</span><h2>QoreChain Diana</h2><p>Native qorechain-diana · EVM chain ID 9800 · No wallet connection or transaction actions.</p></div><Badge tone={identityVerified ? "green" : "amber"}><StatusDot tone={identityVerified ? "green" : "amber"} />{props.loading ? "REFRESHING" : identityVerified ? "LIVE TESTNET" : "UNAVAILABLE"}</Badge><Button icon="refresh" onClick={props.refresh} disabled={props.loading}>{props.loading ? "Refreshing…" : "Refresh testnet data"}</Button></div>
    {props.error && <div className="read-error" role="alert"><StatusDot tone="red" /><div><strong>Refresh could not be completed</strong><span>{props.error}</span></div></div>}
    <div className="monitor-source"><span><strong>REST source</strong> {snapshot?.restEndpoint ?? QORECHAIN_TESTNET.rest}</span><span><strong>EVM RPC source</strong> {snapshot?.evmRpcEndpoint ?? QORECHAIN_TESTNET.evmRpc}</span><span><strong>Last attempt</strong> {snapshot ? formatTime(snapshot.refreshedAt) : "Not refreshed"}</span><span><strong>Last successful field</strong> {snapshot?.lastSuccessfulRefreshAt ? formatTime(snapshot.lastSuccessfulRefreshAt) : "None"}</span></div>
    <div className="monitor-live-grid">
      <Card><SectionHeading title="Native chain identity" subtitle="Latest block · QoreChain REST" action={<Badge tone={nativeVerified ? "green" : "amber"}>{nativeVerified ? "LIVE TESTNET" : "UNAVAILABLE"}</Badge>} />
        <ObservationState observation={snapshot?.chain} identityTrusted={nativeVerified} />
        {snapshot?.chain.status === "available" && <div className="observation-rows"><LiveRow label="Observed chain ID" value={snapshot.chain.value.observedChainId ?? "Unavailable"} /><LiveRow label="Latest native height" value={snapshot.chain.value.height} /><LiveRow label="Block time" value={snapshot.chain.value.blockTime ? formatTime(snapshot.chain.value.blockTime) : "Not exposed"} /><LiveRow label="Expected chain ID" value={snapshot.chain.value.expectedChainId} /></div>}
        {snapshot?.chain.status === "available" && !snapshot.chain.value.matchesExpectedNetwork && <p className="network-warning">Identity mismatch: native values are endpoint observations and are not trusted as Diana testnet data.</p>}
      </Card>
      <Card><SectionHeading title="EVM identity" subtitle="eth_chainId and eth_blockNumber · pinned testnet RPC" action={<Badge tone={evmVerified ? "green" : "amber"}>{evmVerified ? "LIVE TESTNET" : "UNAVAILABLE"}</Badge>} />
        <ObservationState observation={snapshot?.evm} identityTrusted={evmVerified} />
        {snapshot?.evm.status === "available" && <div className="observation-rows"><LiveRow label="Observed EVM chain ID" value={`${snapshot.evm.value.observedChainId} (${snapshot.evm.value.observedChainIdHex})`} /><LiveRow label="Latest EVM height" value={snapshot.evm.value.height} /><LiveRow label="Expected chain ID" value={String(snapshot.evm.value.expectedChainId)} /></div>}
        {snapshot?.evm.status === "available" && !snapshot.evm.value.matchesExpectedNetwork && <p className="network-warning">Identity mismatch: EVM values are not trusted as Diana testnet data.</p>}
      </Card>
      <Card><SectionHeading title="Native PQC protocol features" subtitle="SDK fetchProtocolFeatures · response height-scoped" action={<SourceBadge observation={snapshot?.protocolFeatures} identityTrusted={identityVerified} />} />
        <ObservationState observation={snapshot?.protocolFeatures} />
        {snapshot?.protocolFeatures.status === "available" && <><div className="feature-height">Feature state at height <strong>{snapshot.protocolFeatures.value.height}</strong></div><div className="feature-list">{snapshot.protocolFeatures.value.features.map((feature) => <div className="feature-row" key={feature.name}><span><strong>{feature.name || "Unnamed feature"}</strong><small>{feature.known ? feature.staged ? "Known · staged" : "Known" : "Unknown to this node"}</small></span><Badge tone={feature.enabled ? "green" : feature.staged ? "amber" : "neutral"}>{feature.enabled ? "ENABLED" : feature.staged ? "STAGED" : "DISABLED"}</Badge></div>)}</div></>}
      </Card>
      <Card><SectionHeading title="Account PQC registration" subtitle="Public address only · SDK fetchPqcStatus" action={<SourceBadge observation={snapshot?.accountPqc} identityTrusted={identityVerified} />} />
        <label className="field-label" htmlFor="monitor-public-address">Public QoreChain test address</label><div className="read-form monitor-address-form"><input id="monitor-public-address" value={props.address} onChange={(event) => props.setAddress(event.target.value)} placeholder="qor1…" autoComplete="off" spellCheck={false} /><span className="public-address-label">PUBLIC ADDRESS ONLY</span></div>
        {snapshot?.accountAddress && snapshot.accountAddress !== props.address.trim() && <p className="muted-note">Displayed status belongs to {snapshot.accountAddress}. Refresh after changing the address.</p>}
        <ObservationState observation={snapshot?.accountPqc} />
        {snapshot?.accountPqc.status === "available" && <div className="observation-rows"><LiveRow label="PQC registered" value={snapshot.accountPqc.value.registered ? "Yes" : "No"} /><LiveRow label="Algorithm" value={snapshot.accountPqc.value.algorithm ?? "Not exposed"} /><LiveRow label="Algorithm ID" value={snapshot.accountPqc.value.algorithmId === null ? "Not exposed" : String(snapshot.accountPqc.value.algorithmId)} /><LiveRow label="Proof of possession" value={snapshot.accountPqc.value.possessionProven === null ? "Not exposed" : snapshot.accountPqc.value.possessionProven ? "Proof recorded" : "No proof recorded"} /></div>}
      </Card>
      <Card><SectionHeading title="Account transaction history" subtitle={`Indexed transactions · page ${snapshot?.accountTransactionsPage ?? 1}${snapshot?.accountTransactionsTotal === null || snapshot?.accountTransactionsTotal === undefined ? "" : ` · ${snapshot.accountTransactionsTotal} total`}`} action={<SourceBadge observation={snapshot?.accountTransactions} identityTrusted={identityVerified} />} />
        <ObservationState observation={snapshot?.accountTransactions} />
        {snapshot?.accountTransactions.status === "available" && (snapshot.accountTransactions.value.length ? <div className="network-event-list">{snapshot.accountTransactions.value.map((tx) => <div className="network-event" key={`${tx.transactionHash}-${tx.height}`}><span className={`event-marker ${tx.code === 0 ? "tone-green" : "tone-red"}`} /><span className="network-event-main"><small>HEIGHT {tx.height} · {tx.code === 0 ? "SUCCESS" : `CODE ${tx.code}`}</small><code>{tx.transactionHash}</code>{tx.codespace && <small>{tx.codespace}</small>}</span><Badge tone={tx.code === 0 ? "green" : "red"}>{tx.code === 0 ? "SUCCESS" : "FAILED"}</Badge></div>)}</div> : <EmptyState icon="inbox" title="No indexed transactions returned" detail="The account query succeeded and returned no transaction rows." />)}
        {props.transactionPageError && <div className="read-error" role="alert"><StatusDot tone="amber" /><span>{props.transactionPageError}</span></div>}
        {snapshot?.accountTransactions.status === "available" && snapshot.accountTransactionsHasMore && <Button icon="arrow" variant="secondary" onClick={props.loadMoreTransactions} disabled={props.transactionPageLoading}>{props.transactionPageLoading ? "Loading transactions…" : "Load more transactions"}</Button>}
      </Card>
      <Card><SectionHeading title="EVM authorization window" subtitle="Documented REST read · SDK fetchEvmWindow" action={<SourceBadge observation={snapshot?.evmWindow} identityTrusted={identityVerified} />} />
        <ObservationState observation={snapshot?.evmWindow} />
        {snapshot?.evmWindow.status === "available" && (snapshot.evmWindow.value.found ? <div className="observation-rows"><LiveRow label="Window status" value={snapshot.evmWindow.value.live ? "Live" : "Stored · inactive"} /><LiveRow label="Opened / expires" value={`${snapshot.evmWindow.value.openedHeight ?? "Unavailable"} / ${snapshot.evmWindow.value.expiryHeight ?? "Unavailable"}`} /><LiveRow label="Blocks remaining" value={snapshot.evmWindow.value.remainingBlocks ?? "Unavailable"} /><LiveRow label="Transactions used / maximum" value={`${snapshot.evmWindow.value.usedTransactions ?? "Unavailable"} / ${snapshot.evmWindow.value.maxTransactions ?? "Unavailable"}`} /><LiveRow label="Transactions remaining" value={snapshot.evmWindow.value.remainingTransactions ?? "Unavailable"} /><LiveRow label="Value used / maximum" value={`${snapshot.evmWindow.value.usedValueUqor ?? "Unavailable"} / ${snapshot.evmWindow.value.maxValueUqor ?? "Unavailable"} uqor`} /><LiveRow label="Value remaining" value={`${snapshot.evmWindow.value.remainingValueUqor ?? "Unavailable"} uqor`} /><LiveRow label="Native-only" value={snapshot.evmWindow.value.nativeOnly === null ? "Not exposed" : snapshot.evmWindow.value.nativeOnly ? "Yes" : "No"} /><LiveRow label="Allowed targets" value={snapshot.evmWindow.value.allowedTargets === null ? "Not exposed" : snapshot.evmWindow.value.allowedTargets.length ? snapshot.evmWindow.value.allowedTargets.join(", ") : "Empty list"} /><p className="muted-note">Validators, staking validators, and IBC receiver scope are not returned by this REST read.</p></div> : <EmptyState icon="lock" title="No EVM authorization window found" detail="The successful Diana response returned found: false." />)}
      </Card>
      <Card className="wide-card"><SectionHeading title="Hybrid verification events" subtitle="Node-reported pqc_hybrid_verify events · latest indexed results" action={<Badge tone={!identityVerified ? "amber" : snapshot?.verificationEventsScope === "GLOBAL" ? "amber" : "cyan"}>{!identityVerified ? "UNAVAILABLE" : snapshot?.verificationEventsScope === "GLOBAL" ? "GLOBAL · LIVE TESTNET" : snapshot?.verificationEventsScope === "ACCOUNT" ? "ACCOUNT FILTERED · LIVE TESTNET" : "UNAVAILABLE"}</Badge>} />
        <ObservationState observation={snapshot?.verificationEvents} />
        {snapshot?.verificationEventsScope === "GLOBAL" && <p className="network-warning">GLOBAL event results are not attributed to the entered account unless the returned event includes the matching address.</p>}
        {snapshot?.verificationEvents.status === "available" && (snapshot.verificationEvents.value.length ? <div className="event-list network-event-list">{snapshot.verificationEvents.value.map((event, index) => <div className="network-event" key={`${event.transactionHash}-${index}`}><span className={`event-marker ${event.status === "verified" ? "tone-green" : "tone-amber"}`} /><span className="network-event-main"><small>NODE-REPORTED pqc_hybrid_verify · HEIGHT {event.height}</small><strong>{event.address ?? (snapshot.verificationEventsScope === "GLOBAL" ? "GLOBAL · no address attribute" : "Address attribute unavailable")}</strong><code>{event.transactionHash}</code><small>Reported event evidence: {event.reportedResult} · transaction code: {event.transactionCode ?? "unavailable"} · PQC signature extension: {event.hybridSignaturePresent ? `present · algorithm ${event.hybridSignatureAlgorithmId ?? "unavailable"}` : "unavailable"}</small><small>{event.status === "verified" ? "Node reported success; transaction code, ML-DSA-87 extension shape, and event corroborate. No local cryptographic verification was performed." : "UNAVAILABLE · transaction evidence could not fully corroborate the indexed event."}</small></span><Badge tone={event.status === "verified" ? "green" : "amber"}>{event.status === "verified" ? "NODE REPORTED · LIVE TESTNET" : "UNAVAILABLE"}</Badge></div>)}</div> : <EmptyState icon="check" title="No matching events returned" detail="The indexed query succeeded but returned no matching verification events." />)}
        <p className="muted-note">This is node-reported event evidence. Q-Day Shield checks the documented PQCHybridSignature type URL, ML-DSA-87 algorithm id, and signature length, but does not locally cryptographically verify the signature.</p>
      </Card>
    </div>
    <EvmWindowDemo />
    <div className="monitor-boundary"><Icon name="lock" size={14} />Network data is read-only. The EVM lab below is MOCK DATA and is not evaluated against these observations.</div>
  </>;
}

function SourceBadge<T>({ observation, identityTrusted = true }: { observation: Observation<T> | undefined; identityTrusted?: boolean }): JSX.Element {
  const label = observation?.status === "available" && identityTrusted ? "LIVE TESTNET" : "UNAVAILABLE";
  return <Badge tone={label === "LIVE TESTNET" ? "green" : "amber"}>{label}</Badge>;
}

function ObservationState<T>({ observation, identityTrusted = true }: { observation: Observation<T> | undefined; identityTrusted?: boolean }): JSX.Element {
  if (!observation) return <div className="observation-state"><StatusDot tone="muted" /><Badge tone="amber">UNAVAILABLE</Badge>Not queried yet</div>;
  if (observation.status === "not-configured") return <div className="observation-state"><StatusDot tone="muted" /><Badge tone="amber">UNAVAILABLE</Badge>{observation.message}</div>;
  if (observation.status === "unavailable") return <div className="observation-state" role="status"><StatusDot tone="amber" /><Badge tone="amber">UNAVAILABLE</Badge>{observation.message}<small>Last attempt {formatTime(observation.checkedAt)} · Last successful {observation.lastSuccessfulAt ? formatTime(observation.lastSuccessfulAt) : "none"}{observation.staleValue !== undefined ? " · stale value retained, not shown as live" : ""}</small></div>;
  if (!identityTrusted) return <div className="observation-state" role="status"><StatusDot tone="amber" /><Badge tone="amber">UNAVAILABLE</Badge>Response received but Diana identity did not match; values are untrusted<small>Observed at {formatTime(observation.checkedAt)}</small></div>;
  return <div className="observation-state observation-available"><StatusDot tone="green" /><Badge tone="green">LIVE TESTNET</Badge>Response received from pinned Diana endpoint<small>Checked {formatTime(observation.checkedAt)}</small></div>;
}
function LiveRow({ label, value }: { label: string; value: string }): JSX.Element { return <div className="live-row"><span>{label}</span><strong>{value}</strong></div>; }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString(); }
