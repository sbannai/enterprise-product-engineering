import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { AuditSqlPool } from "../audit/audit-event-store.js";
import type {
  EncryptedProviderPayloadStore,
  ProviderPayloadAuthorization,
  ProviderPayloadReference,
  ProviderPayloadScope,
} from "./encrypted-provider-payload-store.js";
import { ProviderPayloadStoreError } from "./encrypted-provider-payload-store.js";

type PayloadRow = {
  tenant_id: string;
  application_id: string;
  operation_id: string;
  capability_key: string;
  payload_digest: string;
  envelope_version: number;
  nonce: string;
  auth_tag: string;
  ciphertext: string;
};

function normalizedScope(input: ProviderPayloadScope): ProviderPayloadScope {
  const fields: Array<[keyof ProviderPayloadScope, unknown]> = [
    ["tenantId", input.tenantId],
    ["applicationId", input.applicationId],
    ["operationId", input.operationId],
    ["capabilityKey", input.capabilityKey],
  ];
  for (const [key, value] of fields) {
    const maxLength = key === "operationId" ? 200 : 128;
    if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_INVALID");
    }
  }
  return {
    tenantId: input.tenantId.trim(),
    applicationId: input.applicationId.trim(),
    operationId: input.operationId.trim(),
    capabilityKey: input.capabilityKey.trim(),
  };
}

function serialize(value: unknown): Buffer {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("not serializable");
    return Buffer.from(encoded, "utf8");
  } catch {
    throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SERIALIZATION_FAILED");
  }
}

function digest(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function aad(scope: ProviderPayloadScope, reference: string): Buffer {
  return Buffer.from(JSON.stringify([
    scope.tenantId, scope.applicationId, scope.operationId, scope.capabilityKey, reference, 1,
  ]), "utf8");
}

/**
 * Durable AES-256-GCM payload store. Encryption keys are injected by the host
 * and never written to PostgreSQL. Database rows contain ciphertext only.
 * Reads/deletes require a separate operation-scope authorization decision.
 */
export class PostgresEncryptedProviderPayloadStore implements EncryptedProviderPayloadStore {
  private readonly key: Buffer;

  constructor(
    private readonly pool: AuditSqlPool,
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

  /**
   * Inserts the encrypted envelope using a caller-owned transaction.
   * The caller must have started a transaction and owns commit/rollback/release.
   * This is the primitive used to atomically persist a payload with its queue row.
   */
  async putInTransaction<T>(
    client: import("../audit/audit-event-store.js").AuditSqlClient,
    input: ProviderPayloadScope & { payload: T },
  ): Promise<ProviderPayloadReference> {
    const scope = normalizedScope(input);
    let allowed = false;
    try { allowed = await this.authorization.authorizeCreate(scope); } catch {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }
    if (!allowed) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    const plaintext = serialize(input.payload);
    const reference = "pp_" + randomUUID();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(aad(scope, reference));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const payloadDigest = digest(plaintext);
    await client.query("SELECT set_config('eper.tenant_id',$1,true)", [scope.tenantId]);
    await client.query("SELECT set_config('eper.application_id',$1,true)", [scope.applicationId]);
    await client.query(
      `INSERT INTO eper_provider_payloads
        (payload_reference,tenant_id,application_id,operation_id,capability_key,
         payload_digest,envelope_version,nonce,auth_tag,ciphertext)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9)`,
      [reference, scope.tenantId, scope.applicationId, scope.operationId,
        scope.capabilityKey, payloadDigest, nonce.toString("base64"),
        cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")],
    );
    return { ...scope, reference, digest: payloadDigest };
  }

  async put<T>(input: ProviderPayloadScope & { payload: T }): Promise<ProviderPayloadReference> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reference = await this.putInTransaction(client, input);
      await client.query("COMMIT");
      return reference;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async get<T>(input: ProviderPayloadReference): Promise<T> {
    const scope = normalizedScope(input);
    if (typeof input.reference !== "string" || !/^pp_[a-f0-9-]{36}$/.test(input.reference)
      || typeof input.digest !== "string" || !/^[a-f0-9]{64}$/.test(input.digest)) {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_INVALID");
    }
    let allowed = false;
    try {
      allowed = await this.authorization.authorize(scope);
    } catch {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }
    if (!allowed) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");

    const client = await this.pool.connect();
    let row: PayloadRow | undefined;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id',$1,true)", [scope.tenantId]);
      await client.query("SELECT set_config('eper.application_id',$1,true)", [scope.applicationId]);
      const result = await client.query<PayloadRow>(
        `SELECT tenant_id,application_id,operation_id,capability_key,payload_digest,
                envelope_version,nonce,auth_tag,ciphertext
         FROM eper_provider_payloads
         WHERE payload_reference=$1 AND tenant_id=$2 AND application_id=$3
           AND operation_id=$4 AND capability_key=$5`,
        [input.reference, scope.tenantId, scope.applicationId, scope.operationId, scope.capabilityKey],
      );
      row = result.rows[0];
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
    if (!row) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_NOT_FOUND");
    if (row.payload_digest !== input.digest) {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_MISMATCH");
    }
    try {
      if (row.envelope_version !== 1) throw new Error("unsupported envelope");
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(row.nonce, "base64"));
      decipher.setAAD(aad(scope, input.reference));
      decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final(),
      ]);
      const actual = Buffer.from(digest(plaintext), "hex");
      const expected = Buffer.from(input.digest, "hex");
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
    const scope = normalizedScope(input);
    if (typeof input.reference !== "string" || !/^pp_[a-f0-9-]{36}$/.test(input.reference)
      || typeof input.digest !== "string" || !/^[a-f0-9]{64}$/.test(input.digest)) {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_INVALID");
    }
    let allowed = false;
    try {
      allowed = await this.authorization.authorize(scope);
    } catch {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }
    if (!allowed) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id',$1,true)", [scope.tenantId]);
      await client.query("SELECT set_config('eper.application_id',$1,true)", [scope.applicationId]);
      const result = await client.query(
        `DELETE FROM eper_provider_payloads
         WHERE payload_reference=$1 AND tenant_id=$2 AND application_id=$3
           AND operation_id=$4 AND capability_key=$5 AND payload_digest=$6`,
        [input.reference, scope.tenantId, scope.applicationId, scope.operationId, scope.capabilityKey, input.digest],
      );
      await client.query("COMMIT");
      return (result.rowCount ?? 0) === 1;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
