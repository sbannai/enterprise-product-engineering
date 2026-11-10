import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type ProviderPayloadKeyring = {
  /** Legacy v1 key retained until every v1 payload has been lawfully disposed. */
  legacyV1Key: Uint8Array;
  /** Identifier selected for new v2 writes. */
  activeWriteKeyId: string;
  /** Key identifiers map to 32-byte keys; never persist or log these values. */
  keys: ReadonlyMap<string, Uint8Array>;
};

export type EncryptedProviderPayloadEnvelope = {
  envelopeVersion: 1 | 2;
  keyId: string | null;
  nonce: string;
  authTag: string;
  ciphertext: string;
};

export type ProviderPayloadAadScope = {
  tenantId: string;
  applicationId: string;
  operationId: string;
  capabilityKey: string;
  reference: string;
};

function validKey(key: Uint8Array): Buffer {
  const value = Buffer.from(key);
  if (value.length !== 32) throw new Error("PROVIDER_PAYLOAD_KEY_INVALID");
  return value;
}

function validKeyId(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error("PROVIDER_PAYLOAD_KEY_ID_INVALID");
  }
  return value;
}

function aadV1(scope: ProviderPayloadAadScope): Buffer {
  // Must remain byte-for-byte compatible with the original store implementation.
  return Buffer.from(JSON.stringify([
    scope.tenantId, scope.applicationId, scope.operationId,
    scope.capabilityKey, scope.reference, 1,
  ]), "utf8");
}

function aadV2(scope: ProviderPayloadAadScope, keyId: string): Buffer {
  // Version and key identifier are authenticated, preventing metadata substitution.
  return Buffer.from(JSON.stringify([
    scope.tenantId, scope.applicationId, scope.operationId,
    scope.capabilityKey, scope.reference, 2, keyId,
  ]), "utf8");
}

export function encryptProviderPayloadV2(
  plaintext: Uint8Array,
  scope: ProviderPayloadAadScope,
  keyring: ProviderPayloadKeyring,
): EncryptedProviderPayloadEnvelope {
  const keyId = validKeyId(keyring.activeWriteKeyId);
  const configured = keyring.keys.get(keyId);
  if (!configured) throw new Error("PROVIDER_PAYLOAD_KEY_UNKNOWN");
  const key = validKey(configured);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aadV2(scope, keyId));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  return {
    envelopeVersion: 2,
    keyId,
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}


export function decryptProviderPayloadEnvelope(
  envelope: EncryptedProviderPayloadEnvelope,
  scope: ProviderPayloadAadScope,
  keyring: ProviderPayloadKeyring,
): Buffer {
  let key: Buffer;
  let aad: Buffer;
  if (envelope.envelopeVersion === 1) {
    if (envelope.keyId !== null) throw new Error("PROVIDER_PAYLOAD_ENVELOPE_INVALID");
    key = validKey(keyring.legacyV1Key);
    aad = aadV1(scope);
  } else if (envelope.envelopeVersion === 2) {
    if (!envelope.keyId) throw new Error("PROVIDER_PAYLOAD_ENVELOPE_INVALID");
    const keyId = validKeyId(envelope.keyId);
    const configured = keyring.keys.get(keyId);
    if (!configured) throw new Error("PROVIDER_PAYLOAD_KEY_UNKNOWN");
    key = validKey(configured);
    aad = aadV2(scope, keyId);
  } else {
    throw new Error("PROVIDER_PAYLOAD_ENVELOPE_UNSUPPORTED");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.nonce, "base64"));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final(),
    ]);
    return plaintext;
  } catch {
    throw new Error("PROVIDER_PAYLOAD_DECRYPTION_FAILED");
  }
}

export function providerPayloadDigest(plaintext: Uint8Array): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function verifyProviderPayloadDigest(plaintext: Uint8Array, expectedDigest: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) return false;
  const actual = Buffer.from(providerPayloadDigest(plaintext), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
