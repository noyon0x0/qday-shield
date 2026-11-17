import test from "node:test";
import assert from "node:assert/strict";
import { generatePqcKeypair, pqcSign, pqcVerify, ML_DSA_87_PUBLIC_KEY_LENGTH, ML_DSA_87_SECRET_KEY_LENGTH, ML_DSA_87_SIGNATURE_LENGTH } from "@qorechain/sdk";

test("installed QoreChain SDK performs real ML-DSA-87 sign and verify with ephemeral test material", () => {
  const keypair = generatePqcKeypair();
  try {
    const message = new TextEncoder().encode("Q-Day Shield offline cryptographic self-test");
    const modifiedMessage = new TextEncoder().encode("Q-Day Shield altered cryptographic self-test");
    const signature = pqcSign(keypair.secretKey, message);
    assert.equal(keypair.publicKey.byteLength, ML_DSA_87_PUBLIC_KEY_LENGTH);
    assert.equal(keypair.secretKey.byteLength, ML_DSA_87_SECRET_KEY_LENGTH);
    assert.equal(signature.byteLength, ML_DSA_87_SIGNATURE_LENGTH);
    assert.equal(pqcVerify(keypair.publicKey, message, signature), true);
    assert.equal(pqcVerify(keypair.publicKey, modifiedMessage, signature), false);
    assert.equal(pqcVerify(new Uint8Array(ML_DSA_87_PUBLIC_KEY_LENGTH), message, signature), false);
  } finally {
    keypair.secretKey.fill(0);
  }
});
