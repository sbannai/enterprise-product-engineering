import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export interface ProviderPayloadScope {
  tenantId: string;
  applicationId: string;
  operationId: string;
  capabilityKey: string;
}

export interface ProviderPayloadReference extends ProviderPayloadScope {
  reference: string;
  digest: string;
}

export interface ProviderPayloadReadAuthorization {
  authorize(input: ProviderPayloadScope): Promise<boolean>;
}

export interface ProviderPayloadAuthorization extends ProviderPayloadReadAuthorization {
  authorizeCreate(input: ProviderPayloadScope): Promise<boolean>;
}

export interface EncryptedProviderPayloadStore {
  put<T>(input: ProviderPayloadScope & { payload: T }): Promise<ProviderPayloadReference>;
  get<T>(input: ProviderPayloadReference): Promise<T>;
  delete(input: ProviderPayloadReference): Promise<boolean>;
}

type EncryptedEnvelope = {
  version: 1;
  nonce: string;
  tag: string;
  ciphertext: string;
};

type StoredPayload = ProviderPayloadReference & { envelope: EncryptedEnvelope };

export class ProviderPayloadStoreError extends Error {
  constructor(readonly code:
    | "PROVIDER_PAYLOAD_SCOPE_INVALID"
    | "PROVIDER_PAYLOAD_KEY_INVALID"
    | "PROVIDER_PAYLOAD_SERIALIZATION_FAILED"
    | "PROVIDER_PAYLOAD_NOT_FOUND"
    | "PROVIDER_PAYLOAD_SCOPE_MISMATCH"
    | "PROVIDER_PAYLOAD_ACCESS_DENIED"
    | "PROVIDER_PAYLOAD_DIGEST_MISMATCH"
    | "PROVIDER_PAYLOAD_DECRYPTION_FAILED") {
    super(code);
    this.name = "ProviderPayloadStoreError";
  }
}

function identity(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_INVALID");
  }
  return value.trim();
}

function scope(input: ProviderPayloadScope): ProviderPayloadScope {
  return {
    tenantId: identity(input.tenantId, "tenantId"),
    applicationId: identity(input.applicationId, "applicationId"),
    operationId: identity(input.operationId, "operationId"),
    capabilityKey: identity(input.capabilityKey, "capabilityKey"),
  };
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function aad(input: ProviderPayloadScope & { reference: string }): Buffer {
  // Length-delimited JSON prevents ambiguous concatenation between scope fields.
  return Buffer.from(JSON.stringify([
    input.tenantId, input.applicationId, input.operationId,
    input.capabilityKey, input.reference, 1,
  ]), "utf8");
}

function serialize(payload: unknown): Buffer {
  try {
    const json = JSON.stringify(payload);
    if (json === undefined) throw new Error("not JSON serializable");
    return Buffer.from(json, "utf8");
  } catch {
    throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SERIALIZATION_FAILED");
  }
}

function validateReference(input: ProviderPayloadReference): ProviderPayloadReference {
  const normalized = scope(input);
  if (typeof input.reference !== "string" || !/^pp_[a-f0-9-]{36}$/.test(input.reference)
    || typeof input.digest !== "string" || !/^[a-f0-9]{64}$/.test(input.digest)) {
    throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_INVALID");
  }
  return { ...normalized, reference: input.reference, digest: input.digest };
}

/**
 * AES-256-GCM envelope codec and tenant/application-bound payload store.
 * The key is injected by the host; it is never persisted with the envelope.
 * This in-memory implementation is for tests/local exercises only. Production
 * storage must implement EncryptedProviderPayloadStore with durable storage
 * and an independently managed key provider.
 */
export class InMemoryEncryptedProviderPayloadStore implements EncryptedProviderPayloadStore {
  private readonly records = new Map<string, StoredPayload>();
  private readonly key: Buffer;

  constructor(
    key: Uint8Array,
    private readonly authorization: ProviderPayloadAuthorization,
  ) {
    this.key = Buffer.from(key);
    if (this.key.length !== 32) {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_KEY_INVALID");
    }
    if (!authorization || typeof authorization.authorize !== "function"
      || typeof authorization.authorizeCreate !== "function") {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }
  }

  async put<T>(input: ProviderPayloadScope & { payload: T }): Promise<ProviderPayloadReference> {
    const normalized = scope(input);
    let allowed = false;
    try { allowed = await this.authorization.authorizeCreate(normalized); } catch {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }
    if (!allowed) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    const plaintext = serialize(input.payload);
    const reference = "pp_" + randomUUID();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(aad({ ...normalized, reference }));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const record: StoredPayload = {
      ...normalized,
      reference,
      digest: digest(plaintext),
      envelope: {
        version: 1,
        nonce: nonce.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      },
    };
    this.records.set(reference, record);
    return {
      tenantId: record.tenantId,
      applicationId: record.applicationId,
      operationId: record.operationId,
      capabilityKey: record.capabilityKey,
      reference: record.reference,
      digest: record.digest,
    };
  }

  async get<T>(input: ProviderPayloadReference): Promise<T> {
    const requested = validateReference(input);
    const record = this.records.get(requested.reference);
    if (!record) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_NOT_FOUND");

    if (record.tenantId !== requested.tenantId
      || record.applicationId !== requested.applicationId
      || record.operationId !== requested.operationId
      || record.capabilityKey !== requested.capabilityKey
      || record.digest !== requested.digest) {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_MISMATCH");
    }

    let authorized = false;
    try {
      authorized = await this.authorization.authorize({
        tenantId: requested.tenantId,
        applicationId: requested.applicationId,
        operationId: requested.operationId,
        capabilityKey: requested.capabilityKey,
      });
    } catch {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }
    if (!authorized) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");

    try {
      const envelope = record.envelope;
      if (envelope.version !== 1) throw new Error("unsupported envelope");
      const decipher = createDecipheriv(
        "aes-256-gcm", this.key, Buffer.from(envelope.nonce, "base64"),
      );
      decipher.setAAD(aad(requested));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]);
      const actual = Buffer.from(digest(plaintext), "hex");
      const expected = Buffer.from(requested.digest, "hex");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_DIGEST_MISMATCH");
      }
      return JSON.parse(plaintext.toString("utf8")) as T;
    } catch (error) {
      if (error instanceof ProviderPayloadStoreError) throw error;
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_DECRYPTION_FAILED");
    }
  }

  async delete(input: ProviderPayloadReference): Promise<boolean> {
    const requested = validateReference(input);
    const record = this.records.get(requested.reference);
    if (!record) return false;
    if (record.tenantId !== requested.tenantId
      || record.applicationId !== requested.applicationId
      || record.operationId !== requested.operationId
      || record.capabilityKey !== requested.capabilityKey
      || record.digest !== requested.digest) {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_MISMATCH");
    }
    let authorized = false;
    try {
      authorized = await this.authorization.authorize({
        tenantId: requested.tenantId,
        applicationId: requested.applicationId,
        operationId: requested.operationId,
        capabilityKey: requested.capabilityKey,
      });
    } catch {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }
    if (!authorized) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    this.records.delete(requested.reference);
    return true;
  }
}
