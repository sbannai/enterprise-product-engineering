import assert from "node:assert/strict";
import test from "node:test";
import {
  PostgresProviderOperationRepository,
  ProviderOperationIdempotencyConflictError,
  ProviderOperationStateConflictError,
} from "../dist/packages/integrations/postgres-provider-operation-repository.js";

const stamp = "2026-11-03T12:00:00.000Z";
function fixture({ existing = null, claim = null, outcome = null } = {}) {
  const calls = [];
  let stored = existing;
  let claimed = claim;
  let savedOutcome = outcome;
  const row = (status = "QUEUED", overrides = {}) => ({
    operation_id: "00000000-0000-4000-8000-000000000001",
    tenant_id: "tenant-a", application_id: "app-a",
    connection_id: "00000000-0000-4000-8000-000000000002",
    capability_key: "email.send", capability_version: "1",
    idempotency_key: "mail-001", correlation_id: "corr-001",
    operation_status: status, request_digest: "a".repeat(64), payload_reference: "payload-ref-0001",
    provider_reference: null, attempt_count: status === "DISPATCHING" ? 1 : 0,
    available_at: stamp, last_error_code: null, created_at: stamp, updated_at: stamp,
    ...overrides,
  });
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO eper_provider_operations")) {
        if (stored) return { rows: [], rowCount: 0 };
        stored = row();
        return { rows: [stored], rowCount: 1 };
      }
      if (sql.includes("FROM eper_provider_operations") && sql.includes("FOR SHARE")) {
        return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 };
      }
      if (sql.includes("WITH candidate AS")) {
        return { rows: claimed ? [claimed] : [], rowCount: claimed ? 1 : 0 };
      }
      if (sql.includes("UPDATE eper_provider_operations SET")) {
        return { rows: savedOutcome ? [savedOutcome] : [], rowCount: savedOutcome ? 1 : 0 };
      }
      if (sql.includes("SELECT operation_status FROM eper_provider_operations")) {
        return { rows: stored ? [{ operation_status: stored.operation_status }] : [], rowCount: stored ? 1 : 0 };
      }
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return {
    repository: new PostgresProviderOperationRepository({ async connect() { return client; } }),
    calls, row,
  };
}

const base = {
  tenantId: "tenant-a", applicationId: "app-a",
  connectionId: "00000000-0000-4000-8000-000000000002",
  capabilityKey: "email.send", capabilityVersion: "1",
  idempotencyKey: "mail-001", correlationId: "corr-001",
  requestDigest: "a".repeat(64), payloadReference: "payload-ref-0001", actorId: "customer-admin",
  auditEnvironment: "sandbox",
};

test("enqueue creates a durable queued operation with tenant and application scope plus audit", async () => {
  const { repository, calls } = fixture();
  const result = await repository.enqueue(base);
  assert.equal(result.created, true);
  assert.equal(result.operation.status, "QUEUED");
  assert.equal(result.operation.payloadReference, "payload-ref-0001");
  assert.equal(result.operation.attemptCount, 0);
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.tenant_id'") && call.values[0] === "tenant-a"));
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.application_id'") && call.values[0] === "app-a"));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("enqueue is idempotent for the same request digest and rejects key reuse for another payload", async () => {
  const { repository } = fixture({ existing: {
    operation_id: "00000000-0000-4000-8000-000000000001",
    tenant_id: "tenant-a", application_id: "app-a",
    connection_id: base.connectionId, capability_key: "email.send", capability_version: "1",
    idempotency_key: "mail-001", correlation_id: "corr-001",
    operation_status: "QUEUED", request_digest: "a".repeat(64), payload_reference: "payload-ref-0001", provider_reference: null,
    attempt_count: 0, available_at: stamp, last_error_code: null, created_at: stamp, updated_at: stamp,
  } });
  const duplicate = await repository.enqueue(base);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.operation.operationId, "00000000-0000-4000-8000-000000000001");
  await assert.rejects(() => repository.enqueue({ ...base, requestDigest: "b".repeat(64) }),
    error => error instanceof ProviderOperationIdempotencyConflictError);
  await assert.rejects(() => repository.enqueue({ ...base, payloadReference: "payload-ref-0002" }),
    error => error instanceof ProviderOperationIdempotencyConflictError);
});

test("worker claim is scoped, ordered and uses SKIP LOCKED", async () => {
  const { repository, calls } = fixture({ claim: {
    operation_id: "00000000-0000-4000-8000-000000000001",
    tenant_id: "tenant-a", application_id: "app-a",
    connection_id: "00000000-0000-4000-8000-000000000002",
    capability_key: "email.send", capability_version: "1",
    idempotency_key: "mail-001", correlation_id: "corr-001",
    operation_status: "DISPATCHING", request_digest: "a".repeat(64), payload_reference: "payload-ref-0001",
    provider_reference: null, attempt_count: 1, available_at: stamp,
    last_error_code: null, created_at: stamp, updated_at: stamp,
  } });
  const claimed = await repository.claimNext({
    tenantId: "tenant-a", applicationId: "app-a", workerId: "worker-1", auditEnvironment: "sandbox",
  });
  assert.equal(claimed.status, "DISPATCHING");
  assert.equal(claimed.attemptCount, 1);
  assert.ok(calls.some(call => call.sql.includes("FOR UPDATE OF o SKIP LOCKED")));
  assert.ok(calls.some(call => call.sql.includes("b.binding_status='ACTIVE'") && call.sql.includes("pc.connection_status='ACTIVE'") && call.sql.includes("b.allowed_capabilities ? o.capability_key")));
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.application_id'")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events") && call.values.includes("provider.operation.dispatch_claimed")));
});

test("worker returns null when no due operation is available", async () => {
  const { repository } = fixture();
  const claimed = await repository.claimNext({
    tenantId: "tenant-a", applicationId: "app-a", workerId: "worker-1", auditEnvironment: "sandbox",
  });
  assert.equal(claimed, null);
});

test("outcome transition persists safe retry metadata and audit", async () => {
  const { repository, calls } = fixture({
    outcome: {
      operation_id: "00000000-0000-4000-8000-000000000001",
      tenant_id: "tenant-a", application_id: "app-a",
      connection_id: "00000000-0000-4000-8000-000000000002",
      capability_key: "email.send", capability_version: "1",
      idempotency_key: "mail-001", correlation_id: "corr-001",
      operation_status: "RETRYING", request_digest: "a".repeat(64), payload_reference: "payload-ref-0001",
      provider_reference: null, attempt_count: 2, available_at: stamp,
      last_error_code: "UPSTREAM_TIMEOUT", created_at: stamp, updated_at: stamp,
    },
  });
  const result = await repository.recordOutcome({
    tenantId: "tenant-a", applicationId: "app-a",
    operationId: "00000000-0000-4000-8000-000000000001", workerId: "worker-1",
    outcome: "RETRY", errorCode: "UPSTREAM_TIMEOUT", retryAfterSeconds: 30,
    auditEnvironment: "sandbox",
  });
  assert.equal(result.status, "RETRYING");
  assert.equal(result.lastErrorCode, "UPSTREAM_TIMEOUT");
  assert.ok(calls.some(call => call.sql.includes("NOW()+($7::int * INTERVAL '1 second')")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
});

test("retry budget exhaustion moves the operation to NEEDS_ATTENTION", async () => {
  const { repository, calls } = fixture({
    outcome: {
      operation_id: "00000000-0000-4000-8000-000000000001",
      tenant_id: "tenant-a", application_id: "app-a",
      connection_id: "00000000-0000-4000-8000-000000000002",
      capability_key: "email.send", capability_version: "1",
      idempotency_key: "mail-001", correlation_id: "corr-001",
      operation_status: "NEEDS_ATTENTION", request_digest: "a".repeat(64), payload_reference: "payload-ref-0001",
      provider_reference: null, attempt_count: 5, available_at: stamp,
      last_error_code: "UPSTREAM_TIMEOUT", created_at: stamp, updated_at: stamp,
    },
  });
  const result = await repository.recordOutcome({
    tenantId: "tenant-a", applicationId: "app-a",
    operationId: "00000000-0000-4000-8000-000000000001", workerId: "worker-1",
    outcome: "RETRY", errorCode: "UPSTREAM_TIMEOUT", maxAttempts: 5,
    auditEnvironment: "sandbox",
  });
  assert.equal(result.status, "NEEDS_ATTENTION");
  assert.ok(calls.some(call => call.sql.includes("attempt_count >= $8")));
});

test("outcome transition rejects stale or non-dispatching operations", async () => {
  const { repository } = fixture({ outcome: null });
  await assert.rejects(() => repository.recordOutcome({
    tenantId: "tenant-a", applicationId: "app-a",
    operationId: "00000000-0000-4000-8000-000000000001", workerId: "worker-1",
    outcome: "SUCCEEDED", providerReference: "provider-ref-1", auditEnvironment: "sandbox",
  }), error => error instanceof ProviderOperationStateConflictError && error.currentStatus === null);
});

test("enqueue requires a well-formed opaque payload reference", async () => {
  const { repository, calls } = fixture();
  await assert.rejects(() => repository.enqueue({ ...base, payloadReference: "secret token" }),
    /PROVIDER_OPERATION_PAYLOAD_REFERENCE_INVALID/);
  assert.equal(calls.length, 0);
});

test("operation metadata rejects unsafe provider error text and invalid digests", async () => {
  const { repository, calls } = fixture();
  await assert.rejects(() => repository.enqueue({ ...base, requestDigest: "not-a-digest" }),
    /PROVIDER_OPERATION_REQUEST_DIGEST_INVALID/);
  assert.equal(calls.length, 0);
  await assert.rejects(() => repository.recordOutcome({
    tenantId: "tenant-a", applicationId: "app-a",
    operationId: "00000000-0000-4000-8000-000000000001", workerId: "worker-1",
    outcome: "FAILED", errorCode: "Provider returned raw token=secret", auditEnvironment: "sandbox",
  }), /PROVIDER_OPERATION_ERROR_CODE_INVALID/);
});
