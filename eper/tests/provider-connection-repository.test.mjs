import assert from "node:assert/strict";
import test from "node:test";
import {
  PostgresProviderConnectionRepository,
  ProviderConnectionConflictError,
} from "../dist/packages/integrations/postgres-provider-connection-repository.js";

const stamp = "2026-11-02T15:00:00.000Z";
function fixture({ status = "ACTIVE", version = 1, supported = ["email.send", "meeting.create"] } = {}) {
  const calls = [];
  let currentStatus = status;
  let currentVersion = version;
  let id = "00000000-0000-4000-8000-000000000001";
  const row = () => ({
    tenant_id: "tenant-a", connection_id: id, provider_key: "mail-provider",
    display_name: "Primary mail", auth_mode: "oauth", connection_status: currentStatus,
    environment: "sandbox", safe_metadata: { region: "ap-south" },
    version: currentVersion, created_at: stamp, updated_at: stamp,
  });
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT provider_status FROM eper_provider_definitions")) {
        return { rows: [{ provider_status: "ACTIVE" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO eper_provider_connections")) {
        id = values[1]; currentStatus = "PENDING_VALIDATION"; currentVersion = 1;
        return { rows: [row()], rowCount: 1 };
      }
      if (sql.includes("SELECT c.provider_key, c.connection_status, d.capabilities")) {
        return { rows: [{ provider_key: "mail-provider", connection_status: currentStatus, capabilities: supported }], rowCount: 1 };
      }
      if (sql.includes("SELECT version, connection_status FROM eper_provider_connections")) {
        return { rows: [{ version: currentVersion, connection_status: currentStatus }], rowCount: 1 };
      }
      if (sql.includes("SELECT version FROM eper_provider_connections")) {
        return { rows: [{ version: currentVersion }], rowCount: 1 };
      }
      if (sql.includes("UPDATE eper_provider_connections SET secret_reference")) {
        currentVersion += 1; currentStatus = "PENDING_VALIDATION"; return { rows: [row()], rowCount: 1 };
      }
      if (sql.includes("UPDATE eper_provider_connections SET connection_status")) {
        currentVersion += 1; currentStatus = "REVOKED"; return { rows: [row()], rowCount: 1 };
      }
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return { repository: new PostgresProviderConnectionRepository({ async connect() { return client; } }), calls };
}
const audit = {
  tenantId: "tenant-a", actorId: "admin-1", correlationId: "corr-1", auditEnvironment: "sandbox",
};

test("create persists a secret reference but returns a masked connection view", async () => {
  const { repository, calls } = fixture({ status: "PENDING_VALIDATION" });
  const created = await repository.create({
    ...audit, providerKey: "mail-provider", displayName: "Primary mail",
    authMode: "oauth", secretReference: "vault://tenant-a/mail/credential-v1",
    environment: "sandbox",
  });
  assert.equal(created.status, "PENDING_VALIDATION");
  assert.equal(created.tenantId, "tenant-a");
  assert.equal(created.connectionId, "00000000-0000-4000-8000-000000000001");
  assert.equal("secretReference" in created, false);
  assert.ok(calls.some((call) => call.sql.includes("secret_reference")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("application binding rejects a capability not declared by the provider", async () => {
  const { repository, calls } = fixture();
  await assert.rejects(() => repository.bindApplication({
    ...audit, applicationId: "app-a", connectionId: "connection-a",
    allowedCapabilities: ["sms.send"],
  }), /PROVIDER_CAPABILITY_NOT_SUPPORTED/);
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.ok(!calls.some((call) => call.sql.includes("INSERT INTO eper_provider_connection_applications")));
});

test("secret rotation preserves connection identity and forces revalidation", async () => {
  const { repository, calls } = fixture();
  const rotated = await repository.rotateSecretReference({
    ...audit, connectionId: "connection-a", secretReference: "vault://new-version",
    expectedVersion: 1,
  });
  assert.equal(rotated.connectionId, "00000000-0000-4000-8000-000000000001");
  assert.equal(rotated.version, 2);
  assert.equal(rotated.status, "PENDING_VALIDATION");
  assert.ok(calls.some((call) => call.sql.includes("SET secret_reference")));
});

test("stale rotation is rejected before changing the connection", async () => {
  const { repository, calls } = fixture({ version: 3 });
  await assert.rejects(() => repository.rotateSecretReference({
    ...audit, connectionId: "connection-a", secretReference: "vault://new-version",
    expectedVersion: 2,
  }), (error) => error instanceof ProviderConnectionConflictError && error.currentVersion === 3);
  assert.ok(!calls.some((call) => call.sql.includes("SET secret_reference")));
});

test("revocation disables all application bindings in the same audited transaction", async () => {
  const { repository, calls } = fixture();
  const revoked = await repository.revoke({
    ...audit, connectionId: "connection-a", expectedVersion: 1,
  });
  assert.equal(revoked.status, "REVOKED");
  assert.ok(calls.some((call) => call.sql.includes("UPDATE eper_provider_connection_applications")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("invalid tenant identity is rejected before database access", async () => {
  const { repository, calls } = fixture();
  await assert.rejects(() => repository.get(" ", "connection-a"), /PROVIDER_TENANT_INVALID/);
  assert.equal(calls.length, 0);
});
