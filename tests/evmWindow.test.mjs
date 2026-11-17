import test from "node:test";
import assert from "node:assert/strict";

const entry = process.env.QDAY_SECURITY_CORE_ENTRY;
if (!entry) throw new Error("QDAY_SECURITY_CORE_ENTRY is required; run tests through npm test.");
const { evaluateMockEvmTransaction } = await import(entry.replace("security/index.js", "security/evmWindowSimulation.js"));

const tx = { accountLabel: "FAKE TEST ACCOUNT", target: "0x1111111111111111111111111111111111111111", transferValueUqor: 10n, maxFeeUqor: 2n, transactionType: "native-transfer", signerType: "classical-secp256k1", source: "mocked-transaction" };
const base = { found: true, live: true, expiryHeight: 500n, remainingBlocks: 10n, remainingTransactions: 2n, remainingValueUqor: 1_000n, nativeOnly: false, allowedTargets: [] };

test("denies an expired authorization window", () => {
  const result = evaluateMockEvmTransaction({ ...base, live: false, expiryHeight: 99n, remainingBlocks: 0n }, tx, 100n);
  assert.equal(result.code, "expired-window");
  assert.equal(result.allowedInSimulation, false);
});

test("denies when no authorization window exists", () => {
  const result = evaluateMockEvmTransaction({ ...base, found: false, live: false }, tx, 100n);
  assert.equal(result.code, "missing-window");
  assert.match(result.explanation, /secp256k1 key alone cannot open/i);
});

test("denies when the window transaction allowance is exhausted", () => {
  const result = evaluateMockEvmTransaction({ ...base, remainingTransactions: 0n }, tx, 100n);
  assert.equal(result.code, "exhausted-window");
  assert.equal(result.allowedInSimulation, false);
});

test("denies a value plus fee above the remaining bound", () => {
  const result = evaluateMockEvmTransaction({ ...base, remainingValueUqor: 11n }, tx, 100n);
  assert.equal(result.code, "value-limit-exceeded");
  assert.equal(result.totalValueUqor, "12");
});

test("denies targets outside the configured scope", () => {
  const result = evaluateMockEvmTransaction({ ...base, allowedTargets: ["0x2222222222222222222222222222222222222222"] }, tx, 100n);
  assert.equal(result.code, "target-not-allowed");
});

test("classifies an in-bounds mock as local only", () => {
  const result = evaluateMockEvmTransaction(base, tx, 100n);
  assert.equal(result.code, "within-window");
  assert.equal(result.allowedInSimulation, true);
  assert.equal(result.source, "simulated-attack-result");
});
