import type { TokenomicsField, TokenomicsSnapshot, TokenomicsSource, TokenomicsSourceStatus } from "../src/network/tokenomicsTypes.js";

export const DIANA_TOKENOMICS_ENDPOINTS = Object.freeze({
  nativeRest: "https://api-testnet.qore.host",
  evmRpc: "https://evm-testnet.qore.host",
  nativeIdentityPath: "/cosmos/base/tendermint/v1beta1/blocks/latest",
  supplyPath: "/cosmos/bank/v1beta1/supply/by_denom?denom=uqor",
  inflationParamsPath: "/qorechain/inflation/v1/params",
  inflationEpochPath: "/qorechain/inflation/v1/epoch_info",
  burnPath: "/qorechain/burn/v1/stats",
});

type JsonObject = Record<string, unknown>;
type FetchResult =
  | { readonly ok: true; readonly httpStatus: number; readonly data: unknown }
  | { readonly ok: false; readonly httpStatus: number | null; readonly message: string; readonly retryable: boolean };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const NATIVE_CHAIN_ID = "qorechain-diana" as const;
const EVM_CHAIN_ID = 9800 as const;
const RPC_ID = 71_980;

export class TokenomicsService {
  private cache: { snapshot: TokenomicsSnapshot; at: number } | null = null;
  private inFlight: Promise<TokenomicsSnapshot> | null = null;

  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
    private readonly now: () => Date = () => new Date(),
    private readonly timeoutMs = 2_500,
    private readonly cacheTtlMs = 30_000,
  ) {}

  read(): Promise<TokenomicsSnapshot> {
    const now = this.now().getTime();
    if (this.cache && now - this.cache.at < this.cacheTtlMs) {
      return Promise.resolve({ ...this.cache.snapshot, cached: true });
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.readFresh().then((snapshot) => {
      if (snapshot.source !== "UNAVAILABLE") this.cache = { snapshot, at: this.now().getTime() };
      return snapshot;
    }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async readFresh(): Promise<TokenomicsSnapshot> {
    const observedAt = this.now().toISOString();
    const nativeUrl = DIANA_TOKENOMICS_ENDPOINTS.nativeRest + DIANA_TOKENOMICS_ENDPOINTS.nativeIdentityPath;
    const [nativeResult, evmResult] = await Promise.all([
      this.requestJson(nativeUrl),
      this.requestJson(DIANA_TOKENOMICS_ENDPOINTS.evmRpc, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: RPC_ID, method: "eth_chainId", params: [] }),
      }),
    ]);
    const nativeRoot = nativeResult.ok ? object(nativeResult.data) : null;
    const nativeBlock = object(nativeRoot?.block);
    const nativeHeader = object(nativeBlock?.header);
    const nativeObserved = typeof nativeHeader?.chain_id === "string" ? nativeHeader.chain_id : null;
    const evmObserved = evmResult.ok ? parseChainId(evmResult.data) : null;
    const identityVerified = nativeObserved === NATIVE_CHAIN_ID && evmObserved === EVM_CHAIN_ID;
    const blank = unavailableField<string>();

    if (nativeObserved !== NATIVE_CHAIN_ID) {
      const message = nativeObserved !== null && nativeObserved !== NATIVE_CHAIN_ID
        ? "Native endpoint identity did not match Diana."
        : evmObserved !== null && evmObserved !== EVM_CHAIN_ID
          ? "EVM endpoint chain id did not match Diana."
          : "Native and EVM Diana identities could not both be verified; tokenomics reads were not issued.";
      const unavailable = source("unavailable", nativeUrl, nativeResult, message);
      const rpcUnavailable = source("unavailable", DIANA_TOKENOMICS_ENDPOINTS.evmRpc, evmResult, message);
      return {
        source: "UNAVAILABLE", observedAt, lastSuccessfulAt: this.cache?.snapshot.lastSuccessfulAt ?? null, cached: false,
        network: { nativeExpected: NATIVE_CHAIN_ID, nativeObserved, evmExpected: EVM_CHAIN_ID, evmObserved, verified: false },
        rpc: rpcUnavailable, supplySource: unavailable,
        inflationParamsSource: source("not-queried", endpoint(DIANA_TOKENOMICS_ENDPOINTS.inflationParamsPath), null, message),
        inflationEpochSource: source("not-queried", endpoint(DIANA_TOKENOMICS_ENDPOINTS.inflationEpochPath), null, message),
        burnSource: source("not-queried", endpoint(DIANA_TOKENOMICS_ENDPOINTS.burnPath), null, message),
        supplyUqor: blank, supplyQor: blank, totalBurnedUqor: blank, totalBurnedQor: blank,
        burnsBySourceQor: null, lastBurnHeight: blank, emissionMode: blank,
        targetApyBps: blank,
        fixedEpochEmissionQor: blank, epochLengthBlocks: blank, currentEpoch: blank,
        nextEpochHeight: blank, totalMintedQor: blank, maxTotalEmissionQor: blank, remainingEmissionQor: blank,
      };
    }

    const restPaths = [
      DIANA_TOKENOMICS_ENDPOINTS.supplyPath,
      DIANA_TOKENOMICS_ENDPOINTS.inflationParamsPath,
      DIANA_TOKENOMICS_ENDPOINTS.inflationEpochPath,
      DIANA_TOKENOMICS_ENDPOINTS.burnPath,
    ];
    const [supplyResult, paramsResult, epochResult, burnResult, rpcResult] = await Promise.all([
      ...restPaths.map((path) => this.requestJson(endpoint(path))),
      this.requestJson(DIANA_TOKENOMICS_ENDPOINTS.evmRpc, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: RPC_ID, method: "qor_getTokenomicsOverview", params: [] }),
      }),
    ]);

    const supplyRoot = supplyResult.ok ? object(supplyResult.data) : null;
    const supplyAmount = object(supplyRoot?.amount);
    const supplyUqor = integerField(supplyAmount?.denom === "uqor" ? supplyAmount.amount : null);
    const paramsResponse = paramsResult.ok ? object(paramsResult.data) : null;
    // Cosmos module parameter queries return a `params` object. Only read the
    // documented inflation fields from that object; do not infer values.
    const paramsRoot = object(paramsResponse?.params) ?? paramsResponse;
    const epochRoot = epochResult.ok ? object(epochResult.data) : null;
    const burnRoot = burnResult.ok ? object(burnResult.data) : null;
    const burnStats = object(burnRoot?.stats);

    const totalBurnedUqor = integerField(burnStats?.total_burned);
    const burnsBySource = parseBurnSources(burnStats?.burns_by_source);
    const inflationMode = textField(paramsRoot?.emission_mode);
    const targetApyBps = integerField(paramsRoot?.target_apy_bps);
    const epochLengthBlocks = integerField(paramsRoot?.epoch_length);
    const fixedEpochEmission = integerField(paramsRoot?.fixed_epoch_emission);

    const values = {
      supplyUqor,
      totalBurnedUqor,
      inflationMode,
      targetApyBps,
      epochLengthBlocks,
      fixedEpochEmission,
      currentEpoch: integerField(epochRoot?.current_epoch),
      nextEpochHeight: integerField(epochRoot?.next_epoch_height),
      totalMinted: integerField(epochRoot?.total_minted),
      maxTotalEmission: integerField(epochRoot?.max_total_emission),
      remainingEmission: integerField(epochRoot?.remaining_emission),
      lastBurnHeight: integerField(burnStats?.last_burn_height),
    };
    const hasData = Object.values(values).some((field) => field.status === "available");
    const allSourcesAvailable = supplyResult.ok && paramsResult.ok && epochResult.ok && burnResult.ok;
    const emissionInfoAvailable = inflationMode.value === "target_apy"
      ? targetApyBps.status === "available"
      : inflationMode.value === "fixed"
        ? fixedEpochEmission.status === "available"
        : targetApyBps.status === "available" || fixedEpochEmission.status === "available";
    const requiredFields = [supplyUqor, totalBurnedUqor, inflationMode, epochLengthBlocks, values.currentEpoch, values.nextEpochHeight, values.totalMinted, values.maxTotalEmission, values.remainingEmission, values.lastBurnHeight];
    const sourceStatus = identityVerified && allSourcesAvailable && emissionInfoAvailable && requiredFields.every((field) => field.status === "available")
      ? "LIVE TESTNET"
      : hasData ? "PARTIALLY AVAILABLE" : "UNAVAILABLE";
    const rpc = parseRpcSource(rpcResult);

    return {
      source: sourceStatus,
      observedAt,
      lastSuccessfulAt: hasData ? observedAt : this.cache?.snapshot.lastSuccessfulAt ?? null,
      cached: false,
      network: { nativeExpected: NATIVE_CHAIN_ID, nativeObserved, evmExpected: EVM_CHAIN_ID, evmObserved, verified: true },
      rpc,
      supplySource: sourceForJson("supply", endpoint(DIANA_TOKENOMICS_ENDPOINTS.supplyPath), supplyResult, [supplyUqor]),
      inflationParamsSource: sourceForJson("inflation parameters", endpoint(DIANA_TOKENOMICS_ENDPOINTS.inflationParamsPath), paramsResult, [inflationMode, targetApyBps, fixedEpochEmission, epochLengthBlocks]),
      inflationEpochSource: sourceForJson("inflation epoch", endpoint(DIANA_TOKENOMICS_ENDPOINTS.inflationEpochPath), epochResult, [values.currentEpoch, values.nextEpochHeight, values.totalMinted, values.maxTotalEmission, values.remainingEmission]),
      burnSource: sourceForJson("burn statistics", endpoint(DIANA_TOKENOMICS_ENDPOINTS.burnPath), burnResult, [totalBurnedUqor]),
      supplyUqor,
      supplyQor: mapField(supplyUqor, uqorToQor),
      totalBurnedUqor,
      totalBurnedQor: mapField(totalBurnedUqor, uqorToQor),
      burnsBySourceQor: burnsBySource,
      lastBurnHeight: values.lastBurnHeight,
      emissionMode: inflationMode,
      targetApyBps,
      fixedEpochEmissionQor: mapField(fixedEpochEmission, uqorToQor),
      epochLengthBlocks,
      currentEpoch: values.currentEpoch,
      nextEpochHeight: values.nextEpochHeight,
      totalMintedQor: mapField(values.totalMinted, uqorToQor),
      maxTotalEmissionQor: mapField(values.maxTotalEmission, uqorToQor),
      remainingEmissionQor: mapField(values.remainingEmission, uqorToQor),
    };
  }

  private async requestJson(url: string, init: RequestInit = {}): Promise<FetchResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(url, { ...init, signal: controller.signal });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt === 0) {
            await response.body?.cancel().catch(() => undefined);
            continue;
          }
          return { ok: false, httpStatus: response.status, message: `HTTP ${response.status}`, retryable };
        }
        let data: unknown;
        try { data = await response.json(); }
        catch { return { ok: false, httpStatus: response.status, message: "Invalid JSON response", retryable: false }; }
        return { ok: true, httpStatus: response.status, data };
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "AbortError" || /timed out/i.test(error.message));
        if (attempt === 0) continue;
        return { ok: false, httpStatus: null, message: timedOut ? "Request timed out" : "Network request failed", retryable: true };
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, httpStatus: null, message: "Network request failed", retryable: true };
  }
}

export function uqorToQor(value: string): string | null {
  if (!/^\d+$/.test(value)) return null;
  const raw = BigInt(value).toString().padStart(7, "0");
  const whole = raw.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = raw.slice(-6).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function createTokenomicsService(options: { fetcher?: Fetcher; now?: () => Date; timeoutMs?: number; cacheTtlMs?: number } = {}): TokenomicsService {
  return new TokenomicsService(options.fetcher, options.now, options.timeoutMs, options.cacheTtlMs);
}

function endpoint(path: string): string { return DIANA_TOKENOMICS_ENDPOINTS.nativeRest + path; }
function object(value: unknown): JsonObject | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : null; }
function integerField(value: unknown): TokenomicsField<string> {
  return typeof value === "string" && /^\d+$/.test(value) ? { value, status: "available" } : unavailableField();
}
function textField(value: unknown): TokenomicsField<string> {
  return typeof value === "string" && value.trim() ? { value: value.trim(), status: "available" } : unavailableField();
}
function unavailableField<T>(): TokenomicsField<T> { return { value: null, status: "unavailable" }; }
function mapField(field: TokenomicsField<string>, transform: (value: string) => string | null): TokenomicsField<string> {
  if (field.value === null) return unavailableField();
  const value = transform(field.value);
  return value === null ? unavailableField() : { value, status: "available" };
}
function parseBurnSources(value: unknown): Readonly<Record<string, string>> | null {
  const record = object(value);
  if (!record) return null;
  const parsed: Record<string, string> = {};
  for (const [key, amount] of Object.entries(record)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key) || typeof amount !== "string" || !/^\d+$/.test(amount)) continue;
    const converted = uqorToQor(amount);
    if (converted !== null) parsed[key] = converted;
  }
  return Object.keys(parsed).length ? Object.freeze(parsed) : null;
}
function parseChainId(value: unknown): number | null {
  const root = object(value);
  if (!root || root.jsonrpc !== "2.0" || root.id !== RPC_ID || typeof root.result !== "string" || !/^0x[0-9a-f]+$/i.test(root.result)) return null;
  const id = Number(BigInt(root.result));
  return Number.isSafeInteger(id) ? id : null;
}
function source(status: TokenomicsSourceStatus, endpointUrl: string, result: FetchResult | null, message: string | null): TokenomicsSource {
  return { status, endpoint: endpointUrl, httpStatus: result?.httpStatus ?? null, message };
}
function sourceForJson(name: string, endpointUrl: string, result: FetchResult, fields: readonly TokenomicsField<string>[]): TokenomicsSource {
  if (!result.ok) return source("unavailable", endpointUrl, result, `${name} read unavailable: ${result.message}.`);
  const hasFields = fields.some((field) => field.status === "available");
  return source(hasFields ? "available" : "unavailable", endpointUrl, result, hasFields ? null : `${name} response omitted documented fields.`);
}
function parseRpcSource(result: FetchResult): TokenomicsSource {
  if (!result.ok) return source("unavailable", DIANA_TOKENOMICS_ENDPOINTS.evmRpc, result, `qor_getTokenomicsOverview unavailable: ${result.message}.`);
  const root = object(result.data);
  const error = object(root?.error);
  if (error && error.code === -32601) return source("unsupported", DIANA_TOKENOMICS_ENDPOINTS.evmRpc, result, "The Diana JSON-RPC server reports Method not found; REST data is used.");
  if (error) return source("unavailable", DIANA_TOKENOMICS_ENDPOINTS.evmRpc, result, `qor_getTokenomicsOverview returned JSON-RPC error ${String(error.code)}.`);
  if (root?.jsonrpc !== "2.0" || root.id !== RPC_ID || !("result" in root)) return source("unavailable", DIANA_TOKENOMICS_ENDPOINTS.evmRpc, result, "Malformed JSON-RPC response; REST data is used.");
  return source("schema-unverified", DIANA_TOKENOMICS_ENDPOINTS.evmRpc, result, "The method returned a result, but the official documentation does not define its response schema; REST values are used.");
}

