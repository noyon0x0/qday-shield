/** Local education-only EVM authorization-window evaluator. It has no network or wallet capabilities. */
export interface SimulatedEvmWindow {
  found: boolean;
  live: boolean;
  expiryHeight: bigint;
  remainingBlocks: bigint;
  remainingTransactions: bigint;
  remainingValueUqor: bigint;
  nativeOnly: boolean;
  allowedTargets: readonly string[];
}

export interface MockEvmTransaction {
  readonly accountLabel: "FAKE TEST ACCOUNT";
  readonly target: string;
  readonly transferValueUqor: bigint;
  readonly maxFeeUqor: bigint;
  readonly transactionType: "native-transfer" | "contract-call";
  readonly signerType: "classical-secp256k1";
  readonly source: "mocked-transaction";
}

export type EvmWindowDecisionCode = "missing-window" | "expired-window" | "exhausted-window" | "value-limit-exceeded" | "target-not-allowed" | "native-only-window" | "denied" | "within-window";
export interface EvmWindowDecision {
  readonly code: EvmWindowDecisionCode;
  readonly allowedInSimulation: boolean;
  readonly title: string;
  readonly explanation: string;
  readonly totalValueUqor: string;
  readonly currentHeight: string;
  readonly source: "simulated-attack-result";
}

export function evaluateMockEvmTransaction(window: SimulatedEvmWindow, tx: MockEvmTransaction, currentHeight: bigint): EvmWindowDecision {
  const total = tx.transferValueUqor + tx.maxFeeUqor;
  const result = (code: EvmWindowDecisionCode, title: string, explanation: string, allowedInSimulation = false): EvmWindowDecision => ({
    code, allowedInSimulation, title, explanation, totalValueUqor: total.toString(), currentHeight: currentHeight.toString(), source: "simulated-attack-result",
  });
  if (!window.found) return result("missing-window", "Denied · no authorization window", "A stolen secp256k1 key alone cannot open the window. This fake EVM attempt has no window opened by a separately hybrid-signed Native-lane message.");
  if (window.remainingTransactions <= 0n || window.remainingValueUqor <= 0n) return result("exhausted-window", "Denied · window allowance exhausted", "The mock window has no remaining transaction slots or value allowance.");
  if (currentHeight > window.expiryHeight || window.remainingBlocks <= 0n || !window.live) {
    return result("expired-window", "Denied · window is expired or inactive", `The mock window is not live at height ${currentHeight}; its expiry height is ${window.expiryHeight}.`);
  }
  if (total > window.remainingValueUqor) return result("value-limit-exceeded", "Denied · value limit exceeded", `Mock transfer plus maximum fee is ${total} uqor, above the ${window.remainingValueUqor} uqor remaining value bound.`);
  if (window.nativeOnly && tx.transactionType !== "native-transfer") return result("native-only-window", "Denied · native transfers only", "This mock window scope does not admit EVM contract calls.");
  if (window.allowedTargets.length > 0 && !window.allowedTargets.some((target) => target.toLowerCase() === tx.target.toLowerCase())) {
    return result("target-not-allowed", "Denied · target outside scope", "The mock transaction target is not in the window's allowed target list.");
  }
  return result("within-window", "Within mocked window bounds", "The fake transaction fits the mock window bounds. This is a local educational result, not an on-chain admission or protection claim.", true);
}

export const MOCK_EVM_DEMO = Object.freeze({
  currentHeight: 9_942_100n,
  expiredWindow: Object.freeze({ found: true, live: false, expiryHeight: 9_942_099n, remainingBlocks: 0n, remainingTransactions: 3n, remainingValueUqor: 700_000n, nativeOnly: false, allowedTargets: [] }),
  boundedWindow: Object.freeze({ found: true, live: true, expiryHeight: 9_942_400n, remainingBlocks: 300n, remainingTransactions: 3n, remainingValueUqor: 700_000n, nativeOnly: false, allowedTargets: ["0x1111111111111111111111111111111111111111"] }),
  noWindow: Object.freeze({ found: false, live: false, expiryHeight: 0n, remainingBlocks: 0n, remainingTransactions: 0n, remainingValueUqor: 0n, nativeOnly: false, allowedTargets: [] }),
});

export const MOCK_ATTACK_TRANSACTIONS = Object.freeze({
  stolenClassicalKey: Object.freeze({ accountLabel: "FAKE TEST ACCOUNT", target: "0x2222222222222222222222222222222222222222", transferValueUqor: 10_000n, maxFeeUqor: 500n, transactionType: "native-transfer", signerType: "classical-secp256k1", source: "mocked-transaction" }),
  exceedsValue: Object.freeze({ accountLabel: "FAKE TEST ACCOUNT", target: "0x1111111111111111111111111111111111111111", transferValueUqor: 750_000n, maxFeeUqor: 1_000n, transactionType: "native-transfer", signerType: "classical-secp256k1", source: "mocked-transaction" }),
}) satisfies Readonly<Record<string, MockEvmTransaction>>;
