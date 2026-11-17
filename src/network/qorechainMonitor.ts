import {
  clearPqcStatusCache,
  AlgorithmDilithium5,
  fetchEvmWindow,
  fetchPqcStatus,
  fetchProtocolFeatures,
  getLatestBlock,
  getTx,
  isValidBech32,
  searchTxs,
  type FetchLike,
  type GetBlockResponse,
  type PqcStatus,
  type ProtocolFeature,
  type QoreChainClient,
} from "@qorechain/sdk";

export const QORECHAIN_TESTNET = Object.freeze({
  nativeChainId: "qorechain-diana",
  evmChainId: 9800,
  evmChainIdHex: "0x2648",
  rest: "https://api-testnet.qore.host",
  evmRpc: "https://evm-testnet.qore.host",
});

export type Observation<T> =
  | { status: "available"; value: T; checkedAt: string; lastSuccessfulAt: string }
  | { status: "unavailable"; value: null; checkedAt: string; message: string; staleValue?: T; lastSuccessfulAt: string | null }
  | { status: "not-configured"; value: null; checkedAt: null; message: string };

export interface ChainObservation {
  expectedChainId: string;
  observedChainId: string | null;
  height: string;
  blockTime: string | null;
  matchesExpectedNetwork: boolean;
}
export interface EvmObservation {
  expectedChainId: number;
  observedChainId: number | null;
  observedChainIdHex: string | null;
  height: string;
  matchesExpectedNetwork: boolean;
}
export interface AccountPqcObservation {
  registered: boolean;
  algorithmId: number | null;
  algorithm: string | null;
  possessionProven: boolean | null;
}
export interface EvmWindowObservation {
  found: boolean;
  live: boolean;
  openedHeight: string | null;
  expiryHeight: string | null;
  remainingBlocks: string | null;
  maxTransactions: string | null;
  usedTransactions: string | null;
  remainingTransactions: string | null;
  maxValueUqor: string | null;
  usedValueUqor: string | null;
  remainingValueUqor: string | null;
  nativeOnly: boolean | null;
  allowedTargets: readonly string[] | null;
}
export interface AccountTransaction {
  transactionHash: string;
  height: string;
  code: number;
  codespace: string | null;
  rawLog: string | null;
}
export interface AccountTransactionPage {
  readonly transactions: readonly AccountTransaction[];
  readonly page: number;
  readonly hasMore: boolean;
  readonly total: number | null;
}
export interface VerificationEvent {
  transactionHash: string;
  height: string;
  eventType: "pqc_hybrid_verify";
  status: "verified" | "incomplete-evidence";
  reportedResult: "status=verified" | "result=pass";
  address: string | null;
  evidence: "node-reported-event";
  transactionCode: number | null;
  hybridSignaturePresent: boolean;
}
export interface QoreChainObservationSnapshot {
  source: "qorechain-testnet";
  networkName: "QoreChain Diana Testnet";
  restEndpoint: string;
  evmRpcEndpoint: string;
  accountAddress: string | null;
  refreshedAt: string;
  lastSuccessfulRefreshAt: string | null;
  chain: Observation<ChainObservation>;
  evm: Observation<EvmObservation>;
  protocolFeatures: Observation<{ height: string; features: readonly ProtocolFeature[] }>;
  accountPqc: Observation<AccountPqcObservation>;
  accountTransactions: Observation<readonly AccountTransaction[]>;
  accountTransactionsPage: number;
  accountTransactionsHasMore: boolean;
  accountTransactionsTotal: number | null;
  accountTransactionsScope: "ACCOUNT" | "NOT_CONFIGURED";
  evmWindow: Observation<EvmWindowObservation>;
  verificationEvents: Observation<readonly VerificationEvent[]>;
  verificationEventsScope: "ACCOUNT" | "GLOBAL" | "NOT_CONFIGURED";
}

const REQUEST_TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 250;

/** Timeout wrapper used by SDK reads that do not accept their own HttpOptions. */
export function createBoundedReadFetch(fetcher: FetchLike = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS): FetchLike {
  return async (input, init) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("QoreChain read timed out."));
      }, timeoutMs);
    });
    try {
      return await Promise.race([fetcher(input, { ...init, signal: controller.signal }), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}

export function isPublicTestAddress(address: string): boolean {
  return isValidBech32(address.trim(), "qor");
}

export async function refreshQoreChainObservations(
  client: QoreChainClient,
  address: string,
  fetcher: FetchLike = globalThis.fetch,
  now: () => Date = () => new Date(),
  previous?: QoreChainObservationSnapshot | null,
): Promise<QoreChainObservationSnapshot> {
  assertDianaConfiguration(client);
  const read = <T>(operation: () => Promise<T>, old?: Observation<T>): Promise<Observation<T>> => observe(operation, now, old);
  const trimmedAddress = address.trim();
  const addressConfigured = trimmedAddress.length > 0;
  const addressValid = isPublicTestAddress(trimmedAddress);
  const sameAccount = previous?.accountAddress === (addressValid ? trimmedAddress : null) ? previous : null;

  const chain = await read(async () => {
    const block: GetBlockResponse = await getLatestBlock(client.rest);
    const header = block.block?.header;
    if (!header || typeof header.height !== "string" || !/^\d+$/.test(header.height) || BigInt(header.height) <= 0n || typeof header.chain_id !== "string" || !header.chain_id) {
      throw new Error("Latest block omitted a valid chain id or height.");
    }
    return {
      expectedChainId: QORECHAIN_TESTNET.nativeChainId,
      observedChainId: header.chain_id,
      height: header.height,
      blockTime: typeof header.time === "string" ? header.time : null,
      matchesExpectedNetwork: header.chain_id === QORECHAIN_TESTNET.nativeChainId,
    } satisfies ChainObservation;
  }, previous?.chain);

  const evm = await read(async () => {
    const [chainIdHex, blockHeightHex] = await Promise.all([client.evm.ethChainId(), client.evm.ethBlockNumber()]);
    const observedChainIdBigInt = parseRpcQuantity(chainIdHex);
    const observedChainId = Number(observedChainIdBigInt);
    if (!Number.isSafeInteger(observedChainId)) throw new Error("EVM chain id is not a safe integer.");
    const height = parseRpcQuantity(blockHeightHex);
    return {
      expectedChainId: QORECHAIN_TESTNET.evmChainId,
      observedChainId,
      observedChainIdHex: chainIdHex.toLowerCase(),
      height: height.toString(),
      matchesExpectedNetwork: observedChainId === QORECHAIN_TESTNET.evmChainId,
    } satisfies EvmObservation;
  }, previous?.evm);

  const identityVerified = chain.status === "available" && chain.value.matchesExpectedNetwork
    && evm.status === "available" && evm.value.matchesExpectedNetwork;
  const identityFailure = "Native and EVM endpoint identity must match qorechain-diana / 9800 before other reads are trusted.";
  const unavailableForIdentity = <T>(old?: Observation<T>): Observation<T> => unavailable(now, identityFailure, old);

  let protocolFeatures: Observation<{ height: string; features: readonly ProtocolFeature[] }>;
  let accountPqc: Observation<AccountPqcObservation>;
  let accountTransactions: Observation<readonly AccountTransaction[]>;
  let accountTransactionsPage = 1;
  let accountTransactionsHasMore = false;
  let accountTransactionsTotal: number | null = null;
  let evmWindow: Observation<EvmWindowObservation>;
  let verificationEvents: Observation<readonly VerificationEvent[]>;
  let verificationEventsScope: QoreChainObservationSnapshot["verificationEventsScope"] = addressConfigured && addressValid ? "ACCOUNT" : "NOT_CONFIGURED";
  const accountTransactionsScope = addressConfigured && addressValid ? "ACCOUNT" : "NOT_CONFIGURED";

  if (!identityVerified) {
    protocolFeatures = unavailableForIdentity(previous?.protocolFeatures);
    accountPqc = addressConfigured ? unavailableForIdentity(sameAccount?.accountPqc) : notConfigured("Set a public QoreChain test address to query PQC registration.");
    accountTransactions = addressConfigured ? unavailableForIdentity(sameAccount?.accountTransactions) : notConfigured("Set a public QoreChain test address to query transaction history.");
    evmWindow = addressConfigured ? unavailableForIdentity(sameAccount?.evmWindow) : notConfigured("Set a public QoreChain test address to query its EVM authorization window.");
    verificationEvents = unavailableForIdentity(sameAccount?.verificationEvents);
    verificationEventsScope = addressConfigured ? "ACCOUNT" : "NOT_CONFIGURED";
  } else {
    protocolFeatures = await read(async () => {
      const result = await fetchProtocolFeatures({ rest: client.network.endpoints.rest, fetch: fetcher });
      if (result.height <= 0n || result.features.length === 0 || result.features.some((feature) => typeof feature.name !== "string" || !feature.name || typeof feature.enabled !== "boolean" || typeof feature.known !== "boolean" || typeof feature.staged !== "boolean")) {
        throw new Error("Protocol feature response did not contain a usable height and feature set.");
      }
      return { height: result.height.toString(), features: result.features };
    }, previous?.protocolFeatures);

    if (!addressConfigured) {
      accountPqc = notConfigured("Set a public QoreChain test address to query PQC registration.");
      accountTransactions = notConfigured("Set a public QoreChain test address to query transaction history.");
      evmWindow = notConfigured("Set a public QoreChain test address to query its EVM authorization window.");
      verificationEvents = await read(() => readVerificationEvents(client, null, fetcher), sameAccount?.verificationEvents);
      verificationEventsScope = "GLOBAL";
    } else if (!addressValid) {
      const message = "The configured value is not a valid public qor1 test address.";
      accountPqc = unavailable(now, message, sameAccount?.accountPqc);
      accountTransactions = unavailable(now, message, sameAccount?.accountTransactions);
      evmWindow = unavailable(now, message, sameAccount?.evmWindow);
      verificationEvents = await read(() => readVerificationEvents(client, null, fetcher), sameAccount?.verificationEvents);
      verificationEventsScope = "GLOBAL";
    } else {
      accountPqc = await read(async () => {
        clearPqcStatusCache();
        const status: PqcStatus = await fetchPqcStatus({ rest: client.network.endpoints.rest, address: trimmedAddress, fetch: fetcher });
        return {
          registered: status.registered,
          algorithmId: status.algorithmId ?? null,
          algorithm: status.algorithmId === undefined ? null : status.algorithmId === AlgorithmDilithium5 ? "ML-DSA-87 (Dilithium-5)" : `Algorithm ${status.algorithmId}`,
          possessionProven: status.possessionProven ?? null,
        } satisfies AccountPqcObservation;
      }, sameAccount?.accountPqc);

      const txPage = await read(() => fetchAccountTransactionPage(client, trimmedAddress, 1));
      accountTransactions = txPage.status === "available"
        ? { ...txPage, value: txPage.value.transactions }
        : unavailable(now, txPage.message, sameAccount?.accountTransactions);
      if (txPage.status === "available") {
        accountTransactionsPage = txPage.value.page;
        accountTransactionsHasMore = txPage.value.hasMore;
        accountTransactionsTotal = txPage.value.total;
      }

      evmWindow = await read(async () => {
        const strictWindowFetch = async (url: string, init?: RequestInit): Promise<Response> => {
          const response = await fetcher(url, init);
          if (!response.ok) return response;
          const body: unknown = await response.clone().json();
          const record = asRecord(body);
          if (!record || typeof record.found !== "boolean") throw new Error("EVM window response omitted its found status.");
          if (record.found) validateWindowResponse(record);
          return response;
        };
        const window = await fetchEvmWindow({ rest: client.network.endpoints.rest, address: trimmedAddress, fetch: strictWindowFetch });
        if (!window.found) return emptyWindow();
        return {
          found: true,
          live: window.live,
          openedHeight: window.openedHeight.toString(),
          expiryHeight: window.expiryHeight.toString(),
          remainingBlocks: window.remainingBlocks.toString(),
          maxTransactions: window.maxTxs.toString(),
          usedTransactions: window.usedTxs.toString(),
          remainingTransactions: window.remainingTxs.toString(),
          maxValueUqor: window.maxValue.toString(),
          usedValueUqor: window.usedValue.toString(),
          remainingValueUqor: window.remainingValue.toString(),
          nativeOnly: window.nativeOnly,
          allowedTargets: window.allowedTargets,
        } satisfies EvmWindowObservation;
      }, sameAccount?.evmWindow);

      verificationEvents = await read(async () => {
        const eventRead = await readAccountVerificationEvents(client, trimmedAddress, fetcher, () => { verificationEventsScope = "GLOBAL"; });
        verificationEventsScope = eventRead.scope;
        return eventRead.events;
      }, sameAccount?.verificationEvents);
    }
  }

  const refreshedAt = now().toISOString();
  const observations = [chain, evm, protocolFeatures, accountPqc, accountTransactions, evmWindow, verificationEvents];
  const mostRecentSuccess = observations.flatMap((item) => "lastSuccessfulAt" in item && item.lastSuccessfulAt ? [item.lastSuccessfulAt] : [])
    .sort().at(-1) ?? previous?.lastSuccessfulRefreshAt ?? null;
  return Object.freeze({
    source: "qorechain-testnet",
    networkName: "QoreChain Diana Testnet",
    restEndpoint: QORECHAIN_TESTNET.rest,
    evmRpcEndpoint: QORECHAIN_TESTNET.evmRpc,
    accountAddress: addressValid ? trimmedAddress : null,
    refreshedAt,
    lastSuccessfulRefreshAt: mostRecentSuccess,
    chain, evm, protocolFeatures, accountPqc, accountTransactions, accountTransactionsScope,
    accountTransactionsPage, accountTransactionsHasMore, accountTransactionsTotal,
    evmWindow, verificationEvents, verificationEventsScope,
  });
}

export async function fetchAccountTransactionPage(client: QoreChainClient, address: string, page: number): Promise<AccountTransactionPage> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new TypeError("Transaction-history page must be an integer from 1 to 10000.");
  if (!isPublicTestAddress(address)) throw new TypeError("A valid public qor1 address is required for transaction history.");
  const result = await searchTxs(client.rest, { "message.sender": address }, { limit: 10, page, orderBy: "desc" });
  if (!Array.isArray(result.tx_responses)) throw new Error("Account transaction response omitted tx_responses.");
  const transactions = Object.freeze(result.tx_responses.map((tx) => {
    if (!tx || typeof tx.txhash !== "string" || !/^[0-9a-f]+$/i.test(tx.txhash) || typeof tx.height !== "string" || !/^\d+$/.test(tx.height) || !Number.isSafeInteger(tx.code) || tx.code < 0) {
      throw new Error("Account transaction response contained malformed transaction evidence.");
    }
    return {
      transactionHash: tx.txhash,
      height: tx.height,
      code: tx.code,
      codespace: typeof tx.codespace === "string" ? tx.codespace : null,
      rawLog: typeof tx.raw_log === "string" ? tx.raw_log : null,
    };
  }));
  const totalRaw = result.pagination?.total ?? result.total;
  const total = typeof totalRaw === "string" && /^\d+$/.test(totalRaw) && Number.isSafeInteger(Number(totalRaw)) ? Number(totalRaw) : null;
  return { transactions, page, total, hasMore: total !== null ? page * 10 < total : result.pagination?.next_key !== null && result.pagination?.next_key !== undefined };
}

async function readAccountVerificationEvents(client: QoreChainClient, address: string, fetcher: FetchLike, onGlobalFallback: () => void): Promise<{ events: readonly VerificationEvent[]; scope: "ACCOUNT" | "GLOBAL" }> {
  try {
    return { events: await readVerificationEvents(client, address, fetcher), scope: "ACCOUNT" };
  } catch {
    // Some LCD indexes do not index custom event attributes. Fall back only to an explicitly GLOBAL query.
    onGlobalFallback();
    return { events: await readVerificationEvents(client, null, fetcher), scope: "GLOBAL" };
  }
}

async function readVerificationEvents(client: QoreChainClient, address: string | null, fetcher: FetchLike): Promise<readonly VerificationEvent[]> {
  const search = (filters: Record<string, string>) => searchTxs(client.rest, filters, { limit: 10, orderBy: "desc" });
  const results = address
    ? [await search({ "pqc_hybrid_verify.address": address })]
    : await Promise.all([
      search({ "pqc_hybrid_verify.status": "verified" }),
      search({ "pqc_hybrid_verify.result": "pass" }),
    ]);
  const candidates: { transactionHash: string; height: string; address: string | null; reportedResult: "status=verified" | "result=pass" }[] = [];
  const candidateKeys = new Set<string>();
  for (const result of results) {
    if (!Array.isArray(result.tx_responses)) throw new Error("Verification event response omitted tx_responses.");
    for (const tx of result.tx_responses) {
      if (!tx || typeof tx.txhash !== "string" || !/^[0-9a-f]+$/i.test(tx.txhash) || typeof tx.height !== "string" || !/^\d+$/.test(tx.height) || !Array.isArray(tx.events)) {
        throw new Error("Verification event response contained malformed transaction data.");
      }
      for (const event of tx.events) {
        if (!event || typeof event !== "object" || !("type" in event) || event.type !== "pqc_hybrid_verify") continue;
        if (!("attributes" in event) || !Array.isArray(event.attributes)) throw new Error("Hybrid verification event omitted its attributes.");
        const status = findAttribute(event.attributes, "status");
        const resultValue = findAttribute(event.attributes, "result");
        const eventAddress = findAttribute(event.attributes, "address");
        if ((status !== "verified" && resultValue !== "pass") || (address && eventAddress !== address)) continue;
        const key = `${tx.txhash}:${eventAddress ?? ""}:${status ?? resultValue}`;
        if (candidateKeys.has(key)) continue;
        candidateKeys.add(key);
        candidates.push({ transactionHash: tx.txhash, height: tx.height, address: eventAddress, reportedResult: status === "verified" ? "status=verified" : "result=pass" });
      }
    }
  }
  const latestCandidates = candidates.sort((a, b) => {
    const difference = BigInt(b.height) - BigInt(a.height);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }).slice(0, 10);
  const evidence = await Promise.all(latestCandidates.map(async (candidate): Promise<VerificationEvent> => {
    let transactionCode: number | null = null;
    let hybridSignaturePresent = false;
    let matchingTransactionEvent = false;
    try {
      const detail = await getTx(client.rest, candidate.transactionHash);
      const response = asRecord(detail.tx_response);
      transactionCode = response && Number.isSafeInteger(response.code) ? response.code as number : null;
      matchingTransactionEvent = Array.isArray(response?.events) && response.events.some((item) => {
        const verifiedEvent = asRecord(item);
        return verifiedEvent?.type === "pqc_hybrid_verify" && Array.isArray(verifiedEvent.attributes)
          && isPositiveVerificationEvent(verifiedEvent.attributes)
          && (!address || findAttribute(verifiedEvent.attributes, "address") === address);
      });
      const txPayload = asRecord(detail.tx);
      const body = asRecord(txPayload?.body);
      hybridSignaturePresent = Array.isArray(body?.extension_options) && body.extension_options.some((item) => {
        const extension = asRecord(item);
        return extension?.["@type"] === "/qorechain.pqc.v1.PQCHybridSignature"
          && typeof extension.pqc_signature === "string" && isMlDsa87SignatureBase64(extension.pqc_signature);
      });
    } catch {
      // Keep the indexed event visible, but do not promote it to verified evidence.
    }
    const evidenceComplete = transactionCode === 0 && hybridSignaturePresent && matchingTransactionEvent;
    return { ...candidate, eventType: "pqc_hybrid_verify", status: evidenceComplete ? "verified" : "incomplete-evidence", evidence: "node-reported-event", transactionCode, hybridSignaturePresent };
  }));
  return Object.freeze(evidence);
}

function validateWindowResponse(record: Record<string, unknown>): void {
  const numericFields = ["opened_height", "expiry_height", "max_txs", "used_txs", "max_value", "used_value", "remaining_blocks", "remaining_txs", "remaining_value"] as const;
  for (const field of numericFields) if (typeof record[field] !== "string" || !/^\d+$/.test(record[field])) throw new Error(`EVM window response omitted valid ${field}.`);
  if (typeof record.live !== "boolean" || typeof record.native_only !== "boolean" || !Array.isArray(record.allowed_targets) || record.allowed_targets.some((target) => typeof target !== "string")) {
    throw new Error("EVM window response omitted valid documented scope fields.");
  }
}

function emptyWindow(): EvmWindowObservation {
  return { found: false, live: false, openedHeight: null, expiryHeight: null, remainingBlocks: null, maxTransactions: null, usedTransactions: null, remainingTransactions: null, maxValueUqor: null, usedValueUqor: null, remainingValueUqor: null, nativeOnly: null, allowedTargets: null };
}

function assertDianaConfiguration(client: QoreChainClient): void {
  const rest = client.network.endpoints.rest;
  const restIsPinned = rest === QORECHAIN_TESTNET.rest || rest === "/lcd";
  if (client.network.chainId !== QORECHAIN_TESTNET.nativeChainId || client.network.name !== "testnet" || !restIsPinned || client.network.endpoints.evmRpc !== QORECHAIN_TESTNET.evmRpc) {
    throw new Error("Q-Day monitor only permits the configured Diana testnet client and pinned REST/EVM endpoints.");
  }
}

async function observe<T>(operation: () => Promise<T>, now: () => Date, previous?: Observation<T>): Promise<Observation<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const value = await operation();
      const checkedAt = now().toISOString();
      return { status: "available", value, checkedAt, lastSuccessfulAt: checkedAt };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  const httpStatus = lastError instanceof Error ? lastError.message.match(/\bHTTP\s+(\d{3})\b/i)?.[1] : undefined;
  const message = lastError instanceof Error && /timed out|timeout/i.test(lastError.message)
    ? "The testnet read timed out after retrying."
    : httpStatus
      ? `The testnet endpoint returned HTTP ${httpStatus} after retrying.`
      : lastError instanceof Error && /malformed|omitted|valid/i.test(lastError.message)
        ? "The endpoint returned malformed or incomplete data after retrying."
        : "The testnet endpoint could not be reached or returned unusable data after retrying.";
  return unavailable(now, message, previous);
}

function unavailable<T>(now: () => Date, message: string, previous?: Observation<T>): Observation<T> {
  const staleValue = previous?.status === "available" ? previous.value : previous?.status === "unavailable" ? previous.staleValue : undefined;
  const lastSuccessfulAt = previous?.status === "available" ? previous.lastSuccessfulAt : previous?.status === "unavailable" ? previous.lastSuccessfulAt : null;
  return { status: "unavailable", value: null, checkedAt: now().toISOString(), message, ...(staleValue === undefined ? {} : { staleValue }), lastSuccessfulAt };
}

function notConfigured<T>(message: string): Observation<T> {
  return { status: "not-configured", value: null, checkedAt: null, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function findAttribute(attributes: readonly unknown[], key: string): string | null {
  for (const item of attributes) {
    const attribute = asRecord(item);
    if (attribute?.key === key && typeof attribute.value === "string") return attribute.value;
  }
  return null;
}
function isPositiveVerificationEvent(attributes: readonly unknown[]): boolean {
  return findAttribute(attributes, "status") === "verified" || findAttribute(attributes, "result") === "pass";
}
function isMlDsa87SignatureBase64(value: string): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  try { return atob(value).length === 4627; } catch { return false; }
}
function parseRpcQuantity(value: string): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) throw new Error("EVM RPC returned a malformed quantity.");
  return BigInt(value);
}
