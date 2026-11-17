import type { SimulatedActor, SimulatedTransfer, TestIdentity } from "./types.js";

const testIdentities = new WeakSet<object>();

/** Makes an inert local-only identity. The display address is intentionally not chain-valid. */
export function createFakeTestIdentity(label = "Q-Day Demo Operator"): TestIdentity {
  const normalized = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "operator";
  const identity: TestIdentity = Object.freeze({
    environment: "qday-local-demo",
    identityId: `demo:${normalized}`,
    displayAddress: `qday-demo://identity/${normalized}`,
    label: label.trim() || "Q-Day Demo Operator",
  });
  testIdentities.add(identity);
  return identity;
}

export function isFakeTestIdentity(identity: unknown): identity is TestIdentity {
  return typeof identity === "object" && identity !== null && testIdentities.has(identity);
}

export function createUncompromisedTestActor(identity: TestIdentity): SimulatedActor {
  assertFakeIdentity(identity);
  return Object.freeze({ identity, signingMode: "hybrid-test", keyState: "test-only" });
}

/**
 * Returns a simulation marker for a hypothetical classical secp256k1 key compromise.
 * It creates, reads, or stores no private key material and cannot create a real signer.
 */
export function simulateClassicalKeyCompromise(identity: TestIdentity): SimulatedActor {
  assertFakeIdentity(identity);
  return Object.freeze({ identity, signingMode: "classical-secp256k1", keyState: "compromised-simulated" });
}

export function createSimulatedTransfer(input: {
  requestId: string;
  actor: SimulatedActor;
  recipient: string;
  amount: bigint;
  authorizationExpiresAt: number;
}): SimulatedTransfer {
  return Object.freeze({ kind: "simulated-outgoing-transfer", ...input });
}

export function assertFakeIdentity(identity: TestIdentity): void {
  if (!isFakeTestIdentity(identity)) {
    throw new TypeError("Only an identity created by createFakeTestIdentity can enter the Q-Day simulation.");
  }
}
