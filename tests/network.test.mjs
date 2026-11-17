import test from "node:test";
import assert from "node:assert/strict";
import { bytesToBech32, createClient } from "@qorechain/sdk";

const { QORECHAIN_TESTNET, createBoundedReadFetch, fetchAccountTransactionPage, refreshQoreChainObservations } = await import(process.env.QDAY_NETWORK_MONITOR_ENTRY);
const TEST_ADDRESS = bytesToBech32(new Uint8Array(20).fill(7), "qor");
const OTHER_ADDRESS = bytesToBech32(new Uint8Array(20).fill(8), "qor");
const VALID_PQC_SIGNATURE_BASE64 = Buffer.alloc(4627, 7).toString("base64");

function makeFetch(options = {}) {
  const calls = [];
  let featureFailures = options.featureFailures ?? 0;
  let pqcFailures = options.pqcFailures ?? 0;
  let windowFailures = options.windowFailures ?? 0;
  const fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
    if (url.includes("/blocks/latest")) return json({ block: { header: { chain_id: options.nativeChainId ?? "qorechain-diana", height: options.malformedBlock ? "not-a-height" : "123456", time: "2026-11-16T01:02:03Z" } } });
    if (url.includes("/protocol_features") && featureFailures > 0) {
      featureFailures -= 1;
      return json({ error: "unavailable" }, 503);
    }
    if (url.includes("/protocol_features")) return json(options.malformedFeatures ? {} : { height: "123456", features: [{ name: "pqc-sign-bytes-v2", enabled: true, known: true, staged: false }] });
    if (url.includes("/pqc/v1/account/") && pqcFailures > 0) { pqcFailures -= 1; return json({ error: "account unavailable" }, 503); }
    if (url.includes("/pqc/v1/account/")) return json({ found: true, account: { algorithm_id: 1, possession_proven: true } });
    if (url.includes("/pqc/v1/evm_window/") && windowFailures > 0) { windowFailures -= 1; return json({ error: "window unavailable" }, 503); }
    if (url.includes("/pqc/v1/evm_window/")) return json(options.malformedWindow ? { found: true } : { found: true, live: true, opened_height: "123400", expiry_height: "123500", remaining_blocks: "44", max_txs: "5", used_txs: "1", remaining_txs: "4", max_value: "1000000", used_value: "250", remaining_value: "999750", native_only: false, allowed_targets: [] });
    if (/\/cosmos\/tx\/v1beta1\/txs\/[0-9a-f]+/i.test(url)) return json({ tx: { body: { extension_options: [{ "@type": "/qorechain.pqc.v1.PQCHybridSignature", algorithm_id: options.wrongHybridAlgorithm ? 2 : 1, pqc_signature: options.missingHybridSignature ? "" : VALID_PQC_SIGNATURE_BASE64 }] } }, tx_response: { txhash: "ABCD1234", height: "123455", code: options.failedTxCode ? 5 : 0, events: [{ type: "pqc_hybrid_verify", attributes: [options.resultField ? { key: "result", value: "pass" } : { key: "status", value: "verified" }, { key: "address", value: TEST_ADDRESS }] }] } });
    if (url.includes("/cosmos/tx/v1beta1/txs")) {
      const query = decodeURIComponent(url);
      if (query.includes("message.sender")) return json(options.malformedTx ? { tx_responses: [{ txhash: "not-a-hash", height: "bad", code: "0" }] } : { tx_responses: [{ txhash: `ABCD${query.includes("page=2") ? "5678" : "1234"}`, height: query.includes("page=2") ? "123454" : "123455", code: 0, codespace: "", raw_log: "", events: [] }], pagination: { next_key: null, total: String(options.txTotal ?? 1) } });
      if (options.unsupportedAddressEventIndex && query.includes("pqc_hybrid_verify.address")) return json({ error: "attribute not indexed" }, 400);
      const eventAddress = options.globalEventAddress === undefined ? TEST_ADDRESS : options.globalEventAddress;
      return json({ tx_responses: [{ txhash: options.malformedEventResponse ? "bad-hash" : "ABCD1234", height: "123455", events: [{ type: "pqc_hybrid_verify", ...(options.malformedEventResponse ? {} : { attributes: [options.resultField ? { key: "result", value: "pass" } : { key: "status", value: "verified" }, ...(eventAddress ? [{ key: "address", value: eventAddress }] : [])] }) }] }] });
    }
    if (url === QORECHAIN_TESTNET.evmRpc) {
      const request = init.body ? JSON.parse(init.body) : null;
      const method = request?.method;
      const result = method === "eth_chainId" ? options.evmChainId ?? "0x2648" : "0x1e240";
      return json(options.malformedRpc ? { jsonrpc: "2.0", id: request?.id, result: "9800" } : { jsonrpc: "2.0", id: request?.id, result });
    }
    throw new Error(`Unexpected mocked request ${url}`);
  };
  return { fetch, calls };
}
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }); }
function clientFor(fetch) {
  return createClient({ network: "testnet", endpoints: { rest: QORECHAIN_TESTNET.rest, evmRpc: QORECHAIN_TESTNET.evmRpc }, fetch, http: { timeoutMs: 1000, retries: 0, retryDelayMs: 0 } });
}

test("SDK reads verify both Diana identities and observe public account, history, window and chain-reported event evidence", async () => {
  const mock = makeFetch();
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const refreshedAt = new Date("2026-11-16T02:00:00.000Z");
  const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), TEST_ADDRESS, boundedFetch, () => refreshedAt);

  assert.equal(snapshot.source, "qorechain-testnet");
  assert.equal(snapshot.chain.status, "available");
  assert.equal(snapshot.chain.value.observedChainId, "qorechain-diana");
  assert.equal(snapshot.chain.value.height, "123456");
  assert.equal(snapshot.evm.status, "available");
  assert.equal(snapshot.evm.value.observedChainId, 9800);
  assert.equal(snapshot.evm.value.height, "123456");
  assert.equal(snapshot.protocolFeatures.status, "available");
  assert.deepEqual(snapshot.accountPqc.status === "available" && snapshot.accountPqc.value, { registered: true, algorithmId: 1, algorithm: "ML-DSA-87 (Dilithium-5)", possessionProven: true });
  assert.equal(snapshot.accountTransactions.status, "available");
  assert.equal(snapshot.accountTransactions.value[0].code, 0);
  assert.equal(snapshot.accountTransactionsScope, "ACCOUNT");
  assert.equal(snapshot.evmWindow.status, "available");
  assert.equal(snapshot.evmWindow.value.remainingBlocks, "44");
  assert.equal(snapshot.verificationEvents.status, "available");
  assert.equal(snapshot.verificationEventsScope, "ACCOUNT");
  assert.deepEqual(snapshot.verificationEvents.value[0], { transactionHash: "ABCD1234", height: "123455", eventType: "pqc_hybrid_verify", status: "verified", reportedResult: "status=verified", address: TEST_ADDRESS, evidence: "node-reported-event", transactionCode: 0, hybridSignaturePresent: true, hybridSignatureAlgorithmId: 1 });
  assert.equal(snapshot.lastSuccessfulRefreshAt, refreshedAt.toISOString());
  assert.ok(mock.calls.some((call) => decodeURIComponent(call.url).includes(`pqc_hybrid_verify.address='${TEST_ADDRESS}'`)));
  assert.ok(mock.calls.some((call) => decodeURIComponent(call.url).includes(`message.sender='${TEST_ADDRESS}'`)));
});

test("public account transaction history uses SDK page options and reports whether another page exists", async () => {
  const mock = makeFetch({ txTotal: 21 });
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const first = await fetchAccountTransactionPage(clientFor(boundedFetch), TEST_ADDRESS, 1);
  const second = await fetchAccountTransactionPage(clientFor(boundedFetch), TEST_ADDRESS, 2);
  assert.equal(first.transactions[0].transactionHash, "ABCD1234");
  assert.equal(first.hasMore, true);
  assert.equal(first.total, 21);
  assert.equal(second.page, 2);
  assert.equal(second.transactions[0].transactionHash, "ABCD5678");
  assert.ok(mock.calls.some((call) => decodeURIComponent(call.url).includes("page=2")));
  await assert.rejects(() => fetchAccountTransactionPage(clientFor(boundedFetch), "invalid", 1), /valid public qor1/);
  await assert.rejects(() => fetchAccountTransactionPage(clientFor(boundedFetch), TEST_ADDRESS, 0), /page must be an integer/);
});

test("without a configured public address, account reads stay not configured and events are explicitly GLOBAL", async () => {
  const mock = makeFetch({ globalEventAddress: null });
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), "", boundedFetch);
  assert.equal(snapshot.accountPqc.status, "not-configured");
  assert.equal(snapshot.accountTransactions.status, "not-configured");
  assert.equal(snapshot.evmWindow.status, "not-configured");
  assert.equal(snapshot.verificationEventsScope, "GLOBAL");
  assert.equal(snapshot.verificationEvents.status, "available");
  assert.equal(snapshot.verificationEvents.value[0].address, null);
  assert.equal(mock.calls.some((call) => call.url.includes("/qorechain/pqc/v1/account/")), false);
  assert.equal(mock.calls.some((call) => decodeURIComponent(call.url).includes("message.sender")), false);
});

test("falls back to a clearly global event query when the LCD does not index the event address", async () => {
  const mock = makeFetch({ unsupportedAddressEventIndex: true });
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), TEST_ADDRESS, boundedFetch);
  assert.equal(snapshot.verificationEventsScope, "GLOBAL");
  assert.equal(snapshot.verificationEvents.status, "available");
  assert.ok(mock.calls.some((call) => decodeURIComponent(call.url).includes("pqc_hybrid_verify.address")));
  assert.ok(mock.calls.some((call) => decodeURIComponent(call.url).includes("pqc_hybrid_verify.status") && !decodeURIComponent(call.url).includes("pqc_hybrid_verify.address")));
});

test("does not promote a node event to verified when transaction or signature-extension evidence is incomplete", async () => {
  const mock = makeFetch({ missingHybridSignature: true });
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), TEST_ADDRESS, boundedFetch);
  assert.equal(snapshot.verificationEvents.status, "available");
  assert.equal(snapshot.verificationEvents.value[0].status, "incomplete-evidence");
  assert.equal(snapshot.verificationEvents.value[0].hybridSignaturePresent, false);

  const failed = makeFetch({ failedTxCode: true });
  const failedFetch = createBoundedReadFetch(failed.fetch, 1_000);
  const failedSnapshot = await refreshQoreChainObservations(clientFor(failedFetch), TEST_ADDRESS, failedFetch);
  assert.equal(failedSnapshot.verificationEvents.value[0].status, "incomplete-evidence");
  assert.equal(failedSnapshot.verificationEvents.value[0].transactionCode, 5);
});

test("does not accept a hybrid signature extension with a non ML-DSA-87 algorithm id", async () => {
  const mock = makeFetch({ wrongHybridAlgorithm: true });
  const snapshot = await refreshQoreChainObservations(clientFor(mock.fetch), TEST_ADDRESS, mock.fetch);
  assert.equal(snapshot.verificationEvents.status, "available");
  assert.equal(snapshot.verificationEvents.value[0].status, "incomplete-evidence");
  assert.equal(snapshot.verificationEvents.value[0].hybridSignaturePresent, false);
});

test("supports the official result=pass event variant and corroborates its transaction", async () => {
  const mock = makeFetch({ resultField: true });
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), TEST_ADDRESS, boundedFetch);
  assert.equal(snapshot.verificationEvents.status, "available");
  assert.equal(snapshot.verificationEvents.value[0].reportedResult, "result=pass");
  assert.equal(snapshot.verificationEvents.value[0].status, "verified");
});

test("account-filtered events are locally checked against the requested address", async () => {
  const mock = makeFetch({ globalEventAddress: OTHER_ADDRESS });
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), TEST_ADDRESS, boundedFetch);
  assert.equal(snapshot.verificationEventsScope, "ACCOUNT");
  assert.equal(snapshot.verificationEvents.status, "available");
  assert.deepEqual(snapshot.verificationEvents.value, []);
});

test("account endpoint errors and malformed event responses are unavailable instead of negative claims", async () => {
  const accountError = makeFetch({ pqcFailures: 10, windowFailures: 10 });
  const boundedFetch = createBoundedReadFetch(accountError.fetch, 1_000);
  const failed = await refreshQoreChainObservations(clientFor(boundedFetch), TEST_ADDRESS, boundedFetch);
  assert.equal(failed.accountPqc.status, "unavailable");
  assert.equal(failed.evmWindow.status, "unavailable");

  const malformed = makeFetch({ malformedEventResponse: true });
  const malformedFetch = createBoundedReadFetch(malformed.fetch, 1_000);
  const malformedSnapshot = await refreshQoreChainObservations(clientFor(malformedFetch), TEST_ADDRESS, malformedFetch);
  assert.equal(malformedSnapshot.verificationEvents.status, "unavailable");
});

test("invalid public addresses do not trigger account-specific reads", async () => {
  const mock = makeFetch();
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), "not-a-qor-address", boundedFetch);
  assert.equal(snapshot.accountPqc.status, "unavailable");
  assert.equal(snapshot.accountTransactions.status, "unavailable");
  assert.equal(snapshot.evmWindow.status, "unavailable");
  assert.equal(mock.calls.some((call) => call.url.includes("/qorechain/pqc/v1/account/") || call.url.includes("/qorechain/pqc/v1/evm_window/")), false);
});

test("identity mismatch blocks protocol, account, history, window and event reads", async () => {
  const mock = makeFetch({ nativeChainId: "qorechain-vladi", evmChainId: "0x2649" });
  const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
  const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), TEST_ADDRESS, boundedFetch);
  assert.equal(snapshot.chain.status, "available");
  assert.equal(snapshot.chain.value.matchesExpectedNetwork, false);
  assert.equal(snapshot.evm.status, "available");
  assert.equal(snapshot.evm.value.matchesExpectedNetwork, false);
  assert.equal(snapshot.protocolFeatures.status, "unavailable");
  assert.equal(snapshot.accountPqc.status, "unavailable");
  assert.equal(snapshot.accountTransactions.status, "unavailable");
  assert.equal(snapshot.evmWindow.status, "unavailable");
  assert.equal(snapshot.verificationEvents.status, "unavailable");
  assert.equal(mock.calls.some((call) => call.url.includes("/protocol_features") || call.url.includes("/pqc/") || call.url.includes("/cosmos/tx/")), false);
});

test("a testnet preset with a non-Diana endpoint is rejected before network access", async () => {
  const fetch = async () => { throw new Error("must not fetch"); };
  const client = createClient({ network: "testnet", endpoints: { rest: "https://api.qore.host", evmRpc: QORECHAIN_TESTNET.evmRpc }, fetch });
  await assert.rejects(() => refreshQoreChainObservations(client, "", fetch), /pinned REST\/EVM endpoints/);
});

test("network mismatch and unavailable feature endpoint remain explicit and stale feature data is retained as stale", async () => {
  const initial = makeFetch();
  const initialFetch = createBoundedReadFetch(initial.fetch, 1_000);
  const first = await refreshQoreChainObservations(clientFor(initialFetch), "", initialFetch);
  const missing = makeFetch({ featureFailures: 2 });
  const missingFetch = createBoundedReadFetch(missing.fetch, 1_000);
  const unavailable = await refreshQoreChainObservations(clientFor(missingFetch), "", missingFetch, () => new Date("2026-11-17T02:00:00.000Z"), first);
  assert.equal(unavailable.protocolFeatures.status, "unavailable");
  assert.equal(unavailable.protocolFeatures.value, null);
  assert.deepEqual(unavailable.protocolFeatures.staleValue, first.protocolFeatures.value);
  assert.equal(unavailable.protocolFeatures.lastSuccessfulAt, first.protocolFeatures.lastSuccessfulAt);
  assert.match(unavailable.protocolFeatures.message, /HTTP 503 after retrying/);
  assert.equal(missing.calls.filter((call) => call.url.includes("/protocol_features")).length, 2);
});

test("malformed heights, RPC quantities, account transactions and windows never become live zero values", async () => {
  for (const options of [{ malformedBlock: true }, { malformedRpc: true }, { malformedTx: true }, { malformedWindow: true }]) {
    const mock = makeFetch(options);
    const boundedFetch = createBoundedReadFetch(mock.fetch, 1_000);
    const snapshot = await refreshQoreChainObservations(clientFor(boundedFetch), TEST_ADDRESS, boundedFetch);
    if (options.malformedBlock) assert.equal(snapshot.chain.status, "unavailable");
    if (options.malformedRpc) assert.equal(snapshot.evm.status, "unavailable");
    if (options.malformedTx) assert.equal(snapshot.accountTransactions.status, "unavailable");
    if (options.malformedWindow) assert.equal(snapshot.evmWindow.status, "unavailable");
  }
});

test("SDK read transport enforces an abort timeout", async () => {
  const timedFetch = createBoundedReadFetch(() => new Promise(() => {}), 5);
  await assert.rejects(() => timedFetch("https://api-testnet.qore.host/example"), /timed out/i);
});
