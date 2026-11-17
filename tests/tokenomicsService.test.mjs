import test from "node:test";
import assert from "node:assert/strict";

const { createTokenomicsService, DIANA_TOKENOMICS_ENDPOINTS, uqorToQor } = await import(process.env.QDAY_TOKENOMICS_ENTRY);
const base = DIANA_TOKENOMICS_ENDPOINTS.nativeRest;
const epochUrl = `${base}${DIANA_TOKENOMICS_ENDPOINTS.inflationEpochPath}`;
const supplyUrl = `${base}${DIANA_TOKENOMICS_ENDPOINTS.supplyPath}`;
const paramsUrl = `${base}${DIANA_TOKENOMICS_ENDPOINTS.inflationParamsPath}`;
const burnUrl = `${base}${DIANA_TOKENOMICS_ENDPOINTS.burnPath}`;

function fixtureFetch(options = {}) {
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method ?? "GET", body });
    if (url.endsWith(DIANA_TOKENOMICS_ENDPOINTS.nativeIdentityPath)) return json({ block: { header: { chain_id: options.nativeChainId ?? "qorechain-diana", height: "100" } } });
    if (url === DIANA_TOKENOMICS_ENDPOINTS.evmRpc && body.method === "eth_chainId") return json({ jsonrpc: "2.0", id: body.id, result: options.evmChainId ?? "0x2648" });
    if (url === DIANA_TOKENOMICS_ENDPOINTS.evmRpc && body.method === "qor_getTokenomicsOverview") {
      if (options.rpcError) return json({ jsonrpc: "2.0", id: body.id, error: options.rpcError });
      return json({ jsonrpc: "2.0", id: body.id, result: options.rpcResult ?? { opaque: true } });
    }
    if (url === supplyUrl) return options.supplyResponse ?? json({ amount: { denom: "uqor", amount: "1000123" } });
    if (url === paramsUrl) return options.paramsResponse ?? json({ params: { emission_mode: "target_apy", target_apy_bps: "500", fixed_epoch_emission: "0", max_total_emission: "9000000", epoch_length: "43200", enabled: true } });
    if (url === epochUrl) return options.epochResponse ?? json({ current_epoch: "12", block_start: "500", next_epoch_height: "600", total_minted: "1234567", max_total_emission: "9000000", remaining_emission: "7765433" });
    if (url === burnUrl) return options.burnResponse ?? json({ stats: { total_burned: "500000", burns_by_source: { gas_fee: "499000", failed_tx: "1000" }, last_burn_height: "590" } });
    throw new Error(`Unexpected request ${url}`);
  };
  return { fetcher, calls };
}
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }); }

test("normalizes live REST tokenomics and reports RPC method success without trusting undocumented schema", async () => {
  const mock = fixtureFetch();
  const service = createTokenomicsService({ fetcher: mock.fetcher, now: () => new Date("2026-11-17T00:00:00.000Z") });
  const snapshot = await service.read();
  assert.equal(snapshot.network.verified, true);
  assert.equal(snapshot.source, "LIVE TESTNET");
  assert.equal(snapshot.supplyUqor.value, "1000123");
  assert.equal(snapshot.supplyQor.value, "1.000123");
  assert.equal(snapshot.totalBurnedQor.value, "0.5");
  assert.equal(snapshot.emissionMode.value, "target_apy");
  assert.equal(snapshot.targetApyBps.value, "500");
  assert.equal(snapshot.fixedEpochEmissionQor.value, "0");
  assert.equal(snapshot.remainingEmissionQor.value, "7.765433");
  assert.equal(snapshot.burnsBySourceQor.gas_fee, "0.499");
  assert.equal(snapshot.rpc.status, "schema-unverified");
  assert.ok(mock.calls.some((call) => call.body?.method === "qor_getTokenomicsOverview" && call.body.params.length === 0));
});

test("falls back to documented REST values when Diana reports JSON-RPC method not found", async () => {
  const mock = fixtureFetch({ rpcError: { code: -32601, message: "Method not found" } });
  const snapshot = await createTokenomicsService({ fetcher: mock.fetcher }).read();
  assert.equal(snapshot.source, "LIVE TESTNET");
  assert.equal(snapshot.rpc.status, "unsupported");
  assert.equal(snapshot.supplyQor.value, "1.000123");
});

test("HTTP 404 on a documented REST endpoint is unavailable, not zero", async () => {
  const mock = fixtureFetch({ supplyResponse: json({ code: 5, message: "not found" }, 404) });
  const snapshot = await createTokenomicsService({ fetcher: mock.fetcher }).read();
  assert.equal(snapshot.supplySource.status, "unavailable");
  assert.equal(snapshot.supplySource.httpStatus, 404);
  assert.equal(snapshot.supplyUqor.value, null);
  assert.equal(snapshot.source, "PARTIALLY AVAILABLE");
});

test("HTTP 500 retries a read once and leaves only that source unavailable", async () => {
  const mock = fixtureFetch({ burnResponse: json({ error: "temporary" }, 500) });
  const snapshot = await createTokenomicsService({ fetcher: mock.fetcher }).read();
  assert.equal(mock.calls.filter((call) => call.url === burnUrl).length, 2);
  assert.equal(snapshot.burnSource.httpStatus, 500);
  assert.equal(snapshot.totalBurnedQor.value, null);
  assert.equal(snapshot.supplyQor.value, "1.000123");
  assert.equal(snapshot.source, "PARTIALLY AVAILABLE");
});

test("timeout retries a read once and reports unavailable without inventing values", async () => {
  const mock = fixtureFetch();
  let attempts = 0;
  const fetcher = async (input, init) => {
    if (String(input) === supplyUrl) {
      attempts += 1;
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); }, { once: true }));
    }
    return mock.fetcher(input, init);
  };
  const snapshot = await createTokenomicsService({ fetcher, timeoutMs: 5 }).read();
  assert.equal(attempts, 2);
  assert.equal(snapshot.supplySource.status, "unavailable");
  assert.equal(snapshot.supplyUqor.value, null);
  assert.equal(snapshot.source, "PARTIALLY AVAILABLE");
});

test("missing fields and invalid JSON remain partial/unavailable", async () => {
  const mock = fixtureFetch({
    epochResponse: json({ current_epoch: "12" }),
    burnResponse: new Response("not-json", { status: 200 }),
  });
  const snapshot = await createTokenomicsService({ fetcher: mock.fetcher }).read();
  assert.equal(snapshot.currentEpoch.value, "12");
  assert.equal(snapshot.remainingEmissionQor.value, null);
  assert.equal(snapshot.inflationEpochSource.status, "available");
  assert.equal(snapshot.burnSource.status, "unavailable");
  assert.equal(snapshot.totalBurnedQor.value, null);
  assert.equal(snapshot.source, "PARTIALLY AVAILABLE");
});

test("identity mismatch blocks tokenomics endpoints", async () => {
  const mock = fixtureFetch({ nativeChainId: "qorechain-not-diana" });
  const snapshot = await createTokenomicsService({ fetcher: mock.fetcher }).read();
  assert.equal(snapshot.source, "UNAVAILABLE");
  assert.equal(snapshot.network.verified, false);
  assert.equal(mock.calls.some((call) => call.url === supplyUrl), false);
  assert.equal(mock.calls.some((call) => call.body?.method === "qor_getTokenomicsOverview"), false);
});

test("uqor conversion uses exact six-decimal arithmetic", () => {
  assert.equal(uqorToQor("1"), "0.000001");
  assert.equal(uqorToQor("1000000"), "1");
  assert.equal(uqorToQor("1000123"), "1.000123");
  assert.equal(uqorToQor("not-a-number"), null);
});

test("cache reuses a recent verified snapshot and exposes cache provenance", async () => {
  const mock = fixtureFetch();
  let time = Date.parse("2026-11-17T00:00:00.000Z");
  const service = createTokenomicsService({ fetcher: mock.fetcher, now: () => new Date(time) });
  const first = await service.read();
  const callCount = mock.calls.length;
  time += 5_000;
  const cached = await service.read();
  assert.equal(cached.cached, true);
  assert.equal(mock.calls.length, callCount);
  assert.equal(first.cached, false);
});
