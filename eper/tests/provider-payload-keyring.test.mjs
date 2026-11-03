import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import {
  decryptProviderPayloadEnvelope,
  encryptProviderPayloadV2,
  providerPayloadDigest,
  verifyProviderPayloadDigest,
} from "../dist/packages/integrations/provider-payload-keyring.js";

const legacyKey = Buffer.alloc(32, 11);
const keyA = Buffer.alloc(32, 21);
const keyB = Buffer.alloc(32, 31);
const scope = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  operationId: "operation-123",
  capabilityKey: "email.send",
  reference: "pp_12345678-1234-4234-8234-123456789abc",
};
const keyring = {
  legacyV1Key: legacyKey,
  activeWriteKeyId: "key-b",
  keys: new Map([["key-a", keyA], ["key-b", keyB]]),
};

function legacyV1Envelope(plaintext) {
  const nonce = randomBytes(12);
  const aad = Buffer.from(JSON.stringify([
    scope.tenantId, scope.applicationId, scope.operationId,
    scope.capabilityKey, scope.reference, 1,
  ]), "utf8");
  const cipher = createCipheriv("aes-256-gcm", legacyKey, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    envelopeVersion: 1,
    keyId: null,
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

test("reads legacy v1 envelopes with byte-compatible original AAD", () => {
  const plaintext = Buffer.from(JSON.stringify({ body: "legacy retained payload" }));
  const envelope = legacyV1Envelope(plaintext);
  assert.deepEqual(decryptProviderPayloadEnvelope(envelope, scope, keyring), plaintext);
});

test("writes v2 envelopes with active key id authenticated in AAD", () => {
  const plaintext = Buffer.from(JSON.stringify({ body: "new payload" }));
  const envelope = encryptProviderPayloadV2(plaintext, scope, keyring);
  assert.equal(envelope.envelopeVersion, 2);
  assert.equal(envelope.keyId, "key-b");
  assert.deepEqual(decryptProviderPayloadEnvelope(envelope, scope, keyring), plaintext);
});

test("retiring read keys remain usable after active write key changes", () => {
  const plaintext = Buffer.from("rotation continuity");
  const oldWriteRing = { ...keyring, activeWriteKeyId: "key-a" };
  const oldEnvelope = encryptProviderPayloadV2(plaintext, scope, oldWriteRing);
  const rotatedRing = { ...keyring, activeWriteKeyId: "key-b" };
  assert.equal(encryptProviderPayloadV2(plaintext, scope, rotatedRing).keyId, "key-b");
  assert.deepEqual(decryptProviderPayloadEnvelope(oldEnvelope, scope, rotatedRing), plaintext);
});

test("unknown key identifiers fail closed with a stable error", () => {
  const plaintext = Buffer.from("key lookup");
  const envelope = encryptProviderPayloadV2(plaintext, scope, keyring);
  const unavailable = { ...keyring, keys: new Map([["key-a", keyA]]) };
  assert.throws(
    () => decryptProviderPayloadEnvelope(envelope, scope, unavailable),
    error => error.message === "PROVIDER_PAYLOAD_KEY_UNKNOWN",
  );
  const missingActive = { ...keyring, activeWriteKeyId: "missing" };
  assert.throws(
    () => encryptProviderPayloadV2(plaintext, scope, missingActive),
    error => error.message === "PROVIDER_PAYLOAD_KEY_UNKNOWN",
  );
});

test("scope or key-id substitution fails authenticated decryption", () => {
  const envelope = encryptProviderPayloadV2(Buffer.from("bound"), scope, keyring);
  assert.throws(
    () => decryptProviderPayloadEnvelope(envelope, { ...scope, tenantId: "tenant-b" }, keyring),
    error => error.message === "PROVIDER_PAYLOAD_DECRYPTION_FAILED",
  );
  assert.throws(
    () => decryptProviderPayloadEnvelope({ ...envelope, keyId: "key-a" }, scope, keyring),
    error => error.message === "PROVIDER_PAYLOAD_DECRYPTION_FAILED",
  );
});

test("digest verification is constant-time for valid digests and rejects malformed values", () => {
  const plaintext = Buffer.from("digest payload");
  const digest = providerPayloadDigest(plaintext);
  assert.equal(verifyProviderPayloadDigest(plaintext, digest), true);
  assert.equal(verifyProviderPayloadDigest(plaintext, "f".repeat(64)), false);
  assert.equal(verifyProviderPayloadDigest(plaintext, "not-a-digest"), false);
});
