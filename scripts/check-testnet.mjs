import {
  createClient,
  fetchEvmWindow,
  fetchPqcStatus,
  fetchProtocolFeatures,
  getLatestBlock,
  isValidBech32,
  searchTxs,
} from "@qorechain/sdk";

const nativeChainId = "qorechain-diana";
const evmChainId = 9800;
const rest = "https://api-testnet.qore.host";
const evmRpc = "https://evm-testnet.qore.host";
const address = (process.argv[2] ?? process.env.QORE_PUBLIC_TEST_ADDRESS ?? "").trim();

if (address && !isValidBech32(address, "qor")) {
  process.stderr.write("UNAVAILABLE: supplied address is not a valid public qor1 address.\n");
  process.exit(2);
}

const timeoutFetch = (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
const client = createClient({
  network: "testnet",
  endpoints: { rest, evmRpc },
  fetch: timeoutFetch,
  http: { timeoutMs: 10_000, retries: 0, retryDelayMs: 0 },
});

async function run() {
  console.log("Source: LIVE TESTNET read-only check");
  console.log(`REST: ${rest}`);
  console.log(`EVM RPC: ${evmRpc}`);
  console.log(`Configured expected identity: ${nativeChainId} / EVM ${evmChainId}`);

  const [nativeResult, evmChainResult, evmHeightResult] = await Promise.allSettled([
    getLatestBlock(client.rest),
    client.evm.ethChainId(),
    client.evm.ethBlockNumber(),
  ]);
  const header = nativeResult.status === "fulfilled" ? nativeResult.value.block?.header : undefined;
  const nativeValid = Boolean(header && typeof header.chain_id === "string" && /^\d+$/.test(header.height ?? "") && BigInt(header.height) > 0n);
  const observedEvmChainId = evmChainResult.status === "fulfilled" ? parseQuantity(evmChainResult.value) : null;
  const observedEvmHeight = evmHeightResult.status === "fulfilled" ? parseQuantity(evmHeightResult.value) : null;
  if (nativeResult.status === "rejected") console.log(`Native REST request: UNAVAILABLE · ${safeFailure(nativeResult.reason)}`);
  if (evmChainResult.status === "rejected") console.log(`EVM eth_chainId request: UNAVAILABLE · ${safeFailure(evmChainResult.reason)}`);
  if (evmHeightResult.status === "rejected") console.log(`EVM eth_blockNumber request: UNAVAILABLE · ${safeFailure(evmHeightResult.reason)}`);
  const nativeMatches = nativeValid && header.chain_id === nativeChainId;
  const evmMatches = observedEvmChainId === BigInt(evmChainId);
  console.log(`Native chain ID: ${nativeValid ? `${header.chain_id} (${nativeMatches ? "LIVE TESTNET" : "UNAVAILABLE · MISMATCH"})` : "UNAVAILABLE · no valid REST response"}`);
  console.log(`Native block height: ${nativeValid ? header.height : "UNAVAILABLE"}`);
  console.log(`EVM chain ID: ${observedEvmChainId === null ? "UNAVAILABLE · no valid RPC response" : `${observedEvmChainId} (${evmMatches ? "LIVE TESTNET" : "UNAVAILABLE · MISMATCH"})`}`);
  console.log(`EVM block height: ${observedEvmHeight ?? "UNAVAILABLE"}`);

  if (!nativeMatches || !evmMatches) {
    console.error("Stopped: Diana network identity is mismatched or unavailable. No account, feature, event, or window queries were made.");
    process.exitCode = 1;
    return;
  }

  const features = await fetchProtocolFeatures({ rest, fetch: timeoutFetch });
  console.log(`Protocol features: LIVE TESTNET · height ${features.height} · ${features.features.length} entries`);

  if (address) {
    console.log(`Public account: ${address}`);
    const [pqc, window, transactions] = await Promise.all([
      fetchPqcStatus({ rest, address, fetch: timeoutFetch }),
      fetchEvmWindow({ rest, address, fetch: timeoutFetch }),
      searchTxs(client.rest, { "message.sender": address }, { limit: 10, orderBy: "desc" }),
    ]);
    if (!Array.isArray(transactions.tx_responses)) throw new Error("Account transaction response omitted tx_responses.");
    console.log(`PQC registration: LIVE TESTNET · registered=${pqc.registered} · algorithm=${pqc.algorithmId ?? "not exposed"} · possession_proven=${pqc.possessionProven ?? "not exposed"}`);
    console.log(`EVM authorization window: LIVE TESTNET · found=${window.found}${window.found ? ` · live=${window.live} · blocks_remaining=${window.remainingBlocks}` : ""}`);
    console.log(`Account transaction history: LIVE TESTNET · ${transactions.tx_responses.length} returned (limit 10)`);
    for (const tx of transactions.tx_responses) {
      if (!tx || typeof tx.txhash !== "string" || !/^\d+$/.test(tx.height ?? "") || !Number.isSafeInteger(tx.code)) {
        throw new Error("Account transaction response contained malformed transaction evidence.");
      }
      console.log(`  ${tx.txhash} · height=${tx.height} · code=${tx.code}`);
    }
    const filtered = await readVerificationEvents(client, address, true);
    console.log(`Hybrid verification events: ${filtered.scope} · LIVE TESTNET · ${filtered.events.length} node-reported verified event(s)`);
    for (const event of filtered.events) console.log(`  ${event.txhash} · height=${event.height} · address=${event.address ?? "not exposed"} · evidence=pqc_hybrid_verify ${event.reportedEvidence}`);
  } else {
    const global = await readVerificationEvents(client, null, false);
    console.log("Public account: UNAVAILABLE · no public address supplied (pass qor1… as the first argument or QORE_PUBLIC_TEST_ADDRESS)");
    console.log(`Hybrid verification events: GLOBAL · LIVE TESTNET · ${global.events.length} node-reported verified event(s)`);
    for (const event of global.events) console.log(`  ${event.txhash} · height=${event.height} · address=${event.address ?? "not exposed"} · evidence=pqc_hybrid_verify ${event.reportedEvidence}`);
  }
}

async function readVerificationEvents(qoreClient, account, allowGlobalFallback) {
  try {
    const results = account
      ? [await searchTxs(qoreClient.rest, { "pqc_hybrid_verify.address": account }, { limit: 10, orderBy: "desc" })]
      : await Promise.all([
        searchTxs(qoreClient.rest, { "pqc_hybrid_verify.status": "verified" }, { limit: 10, orderBy: "desc" }),
        searchTxs(qoreClient.rest, { "pqc_hybrid_verify.result": "pass" }, { limit: 10, orderBy: "desc" }),
      ]);
    for (const result of results) if (!Array.isArray(result.tx_responses)) throw new Error("Verification event response omitted tx_responses.");
    const events = collectEvents(results.flatMap((result) => result.tx_responses), account);
    return { scope: account ? "ACCOUNT FILTERED" : "GLOBAL", events };
  } catch (error) {
    if (!account || !allowGlobalFallback) throw error;
    const results = await Promise.all([
      searchTxs(qoreClient.rest, { "pqc_hybrid_verify.status": "verified" }, { limit: 10, orderBy: "desc" }),
      searchTxs(qoreClient.rest, { "pqc_hybrid_verify.result": "pass" }, { limit: 10, orderBy: "desc" }),
    ]);
    for (const result of results) if (!Array.isArray(result.tx_responses)) throw new Error("Global verification event response omitted tx_responses.");
    return { scope: "GLOBAL · ADDRESS FILTER UNAVAILABLE", events: collectEvents(results.flatMap((result) => result.tx_responses), null) };
  }
}

function collectEvents(transactions, account) {
  const events = [];
  for (const tx of transactions) {
    if (!tx || typeof tx.txhash !== "string" || !/^\d+$/.test(tx.height ?? "") || !Array.isArray(tx.events)) continue;
    for (const event of tx.events) {
      if (event?.type !== "pqc_hybrid_verify" || !Array.isArray(event.attributes)) continue;
      const status = event.attributes.find((item) => item?.key === "status")?.value;
      const result = event.attributes.find((item) => item?.key === "result")?.value;
      const address = event.attributes.find((item) => item?.key === "address")?.value;
      if ((status !== "verified" && result !== "pass") || (account && address !== account)) continue;
      const reportedEvidence = status === "verified" ? "status=verified" : "result=pass";
      if (events.some((existing) => existing.txhash === tx.txhash && existing.reportedEvidence === reportedEvidence && existing.address === (typeof address === "string" ? address : null))) continue;
      events.push({ txhash: tx.txhash, height: tx.height, address: typeof address === "string" ? address : null, reportedEvidence });
    }
  }
  return events;
}

function parseQuantity(value) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) throw new Error("EVM RPC returned a malformed quantity.");
  return BigInt(value);
}

function safeFailure(error) {
  if (!(error instanceof Error)) return "request failed";
  const detail = error.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/([?&][^=]+)=([^&\s]+)/g, "$1=[redacted]").slice(0, 240);
  return `${error.name}: ${detail || "request failed"}`;
}

run().catch((error) => {
  console.error(`UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
