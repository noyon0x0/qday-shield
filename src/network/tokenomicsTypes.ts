export type TokenomicsSourceStatus = "available" | "unavailable" | "unsupported" | "schema-unverified" | "not-queried";

export interface TokenomicsSource {
  readonly status: TokenomicsSourceStatus;
  readonly endpoint: string;
  readonly httpStatus: number | null;
  readonly message: string | null;
}

export interface TokenomicsField<T> {
  readonly value: T | null;
  readonly status: "available" | "unavailable";
}

export interface TokenomicsSnapshot {
  readonly source: "LIVE TESTNET" | "PARTIALLY AVAILABLE" | "UNAVAILABLE";
  readonly observedAt: string;
  readonly lastSuccessfulAt: string | null;
  readonly cached: boolean;
  readonly network: {
    readonly nativeExpected: "qorechain-diana";
    readonly nativeObserved: string | null;
    readonly evmExpected: 9800;
    readonly evmObserved: number | null;
    readonly verified: boolean;
  };
  readonly rpc: TokenomicsSource;
  readonly supplySource: TokenomicsSource;
  readonly inflationParamsSource: TokenomicsSource;
  readonly inflationEpochSource: TokenomicsSource;
  readonly burnSource: TokenomicsSource;
  readonly supplyUqor: TokenomicsField<string>;
  readonly supplyQor: TokenomicsField<string>;
  readonly totalBurnedUqor: TokenomicsField<string>;
  readonly totalBurnedQor: TokenomicsField<string>;
  readonly burnsBySourceQor: Readonly<Record<string, string>> | null;
  readonly lastBurnHeight: TokenomicsField<string>;
  readonly emissionMode: TokenomicsField<string>;
  readonly targetApyBps: TokenomicsField<string>;
  readonly fixedEpochEmissionQor: TokenomicsField<string>;
  readonly epochLengthBlocks: TokenomicsField<string>;
  readonly currentEpoch: TokenomicsField<string>;
  readonly nextEpochHeight: TokenomicsField<string>;
  readonly totalMintedQor: TokenomicsField<string>;
  readonly maxTotalEmissionQor: TokenomicsField<string>;
  readonly remainingEmissionQor: TokenomicsField<string>;
}
