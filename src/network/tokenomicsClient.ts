import type { TokenomicsField, TokenomicsSnapshot, TokenomicsSource } from "./tokenomicsTypes.js";

export async function fetchTokenomicsSnapshot(fetcher: typeof fetch = fetch): Promise<TokenomicsSnapshot> {
  let response: Response;
  try {
    response = await fetcher("/api/tokenomics", { method: "GET", headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(14_000) });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("Tokenomics service request timed out.");
    throw new Error("Tokenomics service is unavailable. Start the local API and retry.");
  }
  if (!response.ok) throw new Error(`Tokenomics service returned HTTP ${response.status}.`);
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error("Tokenomics service returned invalid JSON."); }
  if (!isSnapshot(payload)) throw new Error("Tokenomics service returned an invalid response schema.");
  return payload;
}

function isSnapshot(value: unknown): value is TokenomicsSnapshot {
  const item = object(value);
  if (!item || !["LIVE TESTNET", "PARTIALLY AVAILABLE", "UNAVAILABLE"].includes(String(item.source))) return false;
  if (typeof item.observedAt !== "string" || !Number.isFinite(Date.parse(item.observedAt))) return false;
  if (item.lastSuccessfulAt !== null && (typeof item.lastSuccessfulAt !== "string" || !Number.isFinite(Date.parse(item.lastSuccessfulAt)))) return false;
  if (typeof item.cached !== "boolean") return false;
  const network = object(item.network);
  if (!network || network.nativeExpected !== "qorechain-diana" || network.evmExpected !== 9800 || typeof network.verified !== "boolean") return false;
  if (network.nativeObserved !== null && typeof network.nativeObserved !== "string") return false;
  if (network.evmObserved !== null && (typeof network.evmObserved !== "number" || !Number.isSafeInteger(network.evmObserved))) return false;
  for (const name of ["rpc", "supplySource", "inflationParamsSource", "inflationEpochSource", "burnSource"]) if (!isSource(item[name])) return false;
  for (const name of ["supplyUqor", "supplyQor", "totalBurnedUqor", "totalBurnedQor", "lastBurnHeight", "emissionMode", "targetApyBps", "fixedEpochEmissionQor", "epochLengthBlocks", "currentEpoch", "nextEpochHeight", "totalMintedQor", "maxTotalEmissionQor", "remainingEmissionQor"]) if (!isField(item[name])) return false;
  return item.burnsBySourceQor === null || (object(item.burnsBySourceQor) !== null && Object.values(object(item.burnsBySourceQor)!).every((entry) => typeof entry === "string" && /^\d+(?:\.\d{1,6})?$/.test(entry)));
}

function isSource(value: unknown): value is TokenomicsSource {
  const item = object(value);
  return Boolean(item && ["available", "unavailable", "unsupported", "schema-unverified", "not-queried"].includes(String(item.status))
    && typeof item.endpoint === "string" && (item.httpStatus === null || (typeof item.httpStatus === "number" && Number.isInteger(item.httpStatus)))
    && (item.message === null || typeof item.message === "string"));
}
function isField(value: unknown): value is TokenomicsField<string> {
  const item = object(value);
  return Boolean(item && ["available", "unavailable"].includes(String(item.status))
    && (item.value === null || typeof item.value === "string"));
}
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
