import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  decryptProviderPayloadEnvelope,
  encryptProviderPayloadV2,
  verifyProviderPayloadDigest,
  type ProviderPayloadKeyring,
} from "./provider-payload-keyring.js";
import {
  appendAuditEventInTransaction,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import type {
  EncryptedProviderPayloadStore,
  ProviderPayloadAuthorization,
  ProviderPayloadReference,
  ProviderPayloadScope,
  ProviderPayloadDeletionDecision,
} from "./encrypted-provider-payload-store.js";
import { ProviderPayloadStoreError } from "./encrypted-provider-payload-store.js";

type PayloadRow = {
  tenant_id: string;
  application_id: string;
  operation_id: string;
  capability_key: string;
  payload_digest: string;
  envelope_version: number;
  key_id: string | null;
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
  const operationId = input.operationId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_SCOPE_INVALID");
  }
  return {
    tenantId: input.tenantId.trim(),
    applicationId: input.applicationId.trim(),
    operationId,
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
  private readonly legacyKey: Buffer | null;
  private readonly keyring: ProviderPayloadKeyring | null;

  constructor(
    private readonly pool: AuditSqlPool,
    key: Uint8Array | ProviderPayloadKeyring,
    private readonly authorization: ProviderPayloadAuthorization,
  ) {
    if (key instanceof Uint8Array) {
      this.legacyKey = Buffer.from(key);
      this.keyring = null;
      if (this.legacyKey.length !== 32) {
        throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_KEY_INVALID");
      }
    } else {
      this.legacyKey = null;
      this.keyring = key;
      if (!(key.legacyV1Key instanceof Uint8Array) || key.legacyV1Key.length !== 32
        || !(key.keys instanceof Map) || !key.activeWriteKeyId) {
        throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_KEY_INVALID");
      }
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
    const payloadDigest = digest(plaintext);
    let envelopeVersion: 1 | 2 = 1;
    let keyId: string | null = null;
    let nonce: string;
    let authTag: string;
    let ciphertext: string;
    if (this.keyring) {
      const envelope = encryptProviderPayloadV2(plaintext, {
        ...scope, reference,
      }, this.keyring);
      envelopeVersion = 2;
      keyId = envelope.keyId;
      nonce = envelope.nonce;
      authTag = envelope.authTag;
      ciphertext = envelope.ciphertext;
    } else {
      const nonceBytes = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.legacyKey!, nonceBytes);
      cipher.setAAD(aad(scope, reference));
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      nonce = nonceBytes.toString("base64");
      authTag = cipher.getAuthTag().toString("base64");
      ciphertext = encrypted.toString("base64");
    }
    await client.query("SELECT set_config('eper.tenant_id',$1,true)", [scope.tenantId]);
    await client.query("SELECT set_config('eper.application_id',$1,true)", [scope.applicationId]);
    await client.query(
      `INSERT INTO eper_provider_payloads
        (payload_reference,tenant_id,application_id,operation_id,capability_key,
         payload_digest,envelope_version,key_id,nonce,auth_tag,ciphertext)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [reference, scope.tenantId, scope.applicationId, scope.operationId,
        scope.capabilityKey, payloadDigest, envelopeVersion, keyId, nonce, authTag, ciphertext],
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
                envelope_version,key_id,nonce,auth_tag,ciphertext
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
      let plaintext: Buffer;
      if (this.keyring) {
        plaintext = decryptProviderPayloadEnvelope({
          envelopeVersion: row.envelope_version as 1 | 2,
          keyId: row.key_id,
          nonce: row.nonce,
          authTag: row.auth_tag,
          ciphertext: row.ciphertext,
        }, { ...scope, reference: input.reference }, this.keyring);
      } else {
        if (row.envelope_version !== 1 || row.key_id !== null) {
          throw new Error("PROVIDER_PAYLOAD_KEYRING_REQUIRED");
        }
        const decipher = createDecipheriv("aes-256-gcm", this.legacyKey!, Buffer.from(row.nonce, "base64"));
        decipher.setAAD(aad(scope, input.reference));
        decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
        plaintext = Buffer.concat([
          decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final(),
        ]);
      }
      if (!verifyProviderPayloadDigest(plaintext, input.digest)) {
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
    if (typeof this.authorization.authorizeDelete !== "function") {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_DELETE_AUDIT_CONTEXT_REQUIRED");
    }
    let decision: ProviderPayloadDeletionDecision | null = null;
    try {
      decision = await this.authorization.authorizeDelete(scope);
    } catch {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }
    if (!decision || !decision.actorId?.trim() || !decision.reasonCode?.trim()
      || !decision.policyDecisionReference?.trim()) {
      throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_ACCESS_DENIED");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id',$1,true)", [scope.tenantId]);
      await client.query("SELECT set_config('eper.application_id',$1,true)", [scope.applicationId]);
      const selected = await client.query<{
        expires_at: Date | string | null;
        legal_hold: boolean;
        retention_policy_id: string | null;
        retention_policy_version: string | null;
      }>(
        `SELECT expires_at,legal_hold,retention_policy_id,retention_policy_version
         FROM eper_provider_payloads
         WHERE payload_reference=$1 AND tenant_id=$2 AND application_id=$3
           AND operation_id=$4 AND capability_key=$5 AND payload_digest=$6
         FOR UPDATE`,
        [input.reference, scope.tenantId, scope.applicationId, scope.operationId,
          scope.capabilityKey, input.digest],
      );
      const row = selected.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return false;
      }
      if (row.legal_hold) throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_LEGAL_HOLD_ACTIVE");
      if (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()
        || !row.retention_policy_id || !row.retention_policy_version) {
        throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_RETENTION_NOT_ELIGIBLE");
      }
      // Detach the optional operation reference in this transaction before
      // retention removes the envelope; the deferred reverse FK must still hold.
      const detached = await client.query(
        `UPDATE eper_provider_operations SET payload_reference=NULL
         WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3
           AND payload_reference=$4`,
        [scope.tenantId, scope.applicationId, scope.operationId, input.reference],
      );
      if ((detached.rowCount ?? 0) !== 1) {
        throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_OPERATION_REFERENCE_MISMATCH");
      }
      const removed = await client.query(
        `DELETE FROM eper_provider_payloads
         WHERE payload_reference=$1 AND tenant_id=$2 AND application_id=$3
           AND operation_id=$4 AND capability_key=$5 AND payload_digest=$6
           AND legal_hold=FALSE AND expires_at IS NOT NULL AND expires_at <= NOW()
           AND retention_policy_id IS NOT NULL AND retention_policy_version IS NOT NULL`,
        [input.reference, scope.tenantId, scope.applicationId, scope.operationId,
          scope.capabilityKey, input.digest],
      );
      if ((removed.rowCount ?? 0) !== 1) {
        throw new ProviderPayloadStoreError("PROVIDER_PAYLOAD_RETENTION_NOT_ELIGIBLE");
      }
      await appendAuditEventInTransaction(client, {
        tenantId: scope.tenantId,
        applicationId: scope.applicationId,
        environment: decision.environment,
        actorType: decision.actorType,
        actorId: decision.actorId,
        action: "provider.payload.deleted",
        outcome: "success",
        reasonCode: decision.reasonCode,
        resourceType: "provider_payload",
        resourceId: input.reference,
        operationId: scope.operationId,
        correlationId: decision.correlationId,
        source: decision.source,
        operationName: "provider_payload_retention_delete",
        payload: {
          payloadReference: input.reference,
          payloadDigest: input.digest,
          retentionPolicyId: row.retention_policy_id,
          retentionPolicyVersion: row.retention_policy_version,
          policyDecisionReference: decision.policyDecisionReference,
        },
      });
      await client.query("COMMIT");
      return true;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
