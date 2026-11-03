import assert from "node:assert/strict";
import test from "node:test";
import {
  PostgresProviderConnectionRepository,
  ProviderConnectionConflictError,
} from "../dist/packages/integrations/postgres-provider-connection-repository.js";

const stamp = "2026-11-02T15:00:00.000Z";
function fixture({ status = "ACTIVE", providerStatus = "ACTIVE", providerAuthModes = ["oauth"], version = 1, supported = ["email.send", "meeting.create"], bindingApps = ["app-a"] } = {}) {
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
      if (sql.includes("FROM eper_provider_connections c") && sql.includes("JOIN eper_provider_connection_applications b")) {
        return { rows: [{
          ...row(), binding_status: "ACTIVE", allowed_capabilities: ["email.send"],
        }], rowCount: 1 };
      }
      if (sql.includes("SELECT provider_status FROM eper_provider_definitions")) {
        return { rows: [{ provider_status: providerStatus }], rowCount: 1 };
      }
      if (sql.includes("SELECT provider_status, capabilities, auth_modes")) {
        return { rows: [{ provider_status: providerStatus, capabilities: supported, auth_modes: providerAuthModes }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO eper_provider_connections")) {
        id = values[1]; currentStatus = "PENDING_VALIDATION"; currentVersion = 1;
        return { rows: [row()], rowCount: 1 };
      }
      if (sql.includes("SELECT c.provider_key, c.connection_status, d.provider_status, d.capabilities")) {
        return { rows: [{ provider_key: "mail-provider", connection_status: currentStatus, provider_status: providerStatus, capabilities: supported }], rowCount: 1 };
      }
      if (sql.includes("SELECT application_id FROM eper_provider_connection_applications")) {
        return { rows: bindingApps.map((application_id) => ({ application_id })), rowCount: bindingApps.length };
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
  assert.match(created.connectionId, /^[0-9a-f-]{36}$/);
  assert.equal("secretReference" in created, false);
  assert.ok(calls.some((call) => call.sql.includes("secret_reference")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((call) => call.sql.includes("set_config('eper.tenant_id'") && call.values[0] === "tenant-a"));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("create-and-bind persists the customer connection and first application binding atomically", async () => {
  const { repository, calls } = fixture({ status: "ACTIVE" });
  const result = await repository.createAndBindApplication({
    ...audit, applicationId: "app-a", providerKey: "mail-provider",
    displayName: "Customer mail", authMode: "oauth",
    secretReference: "synthetic://customer/mail-secret", environment: "sandbox",
    allowedCapabilities: ["email.send"],
  });
  assert.equal(result.connection.status, "PENDING_VALIDATION");
  assert.equal("secretReference" in result.connection, false);
  assert.equal(result.bindingStatus, "PENDING_VALIDATION");
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_provider_connections")));
  const binding = calls.find(call => call.sql.includes("INSERT INTO eper_provider_connection_applications"));
  assert.ok(binding);
  assert.equal(binding.values[1], "app-a");
  assert.equal(binding.values[6], "PENDING_VALIDATION");
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.application_id'") && call.values[0] === "app-a"));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("create-and-bind rolls back when the catalogue provider is suspended", async () => {
  const { repository, calls } = fixture({ providerStatus: "SUSPENDED" });
  await assert.rejects(() => repository.createAndBindApplication({
    ...audit, applicationId: "app-a", providerKey: "mail-provider",
    displayName: "Customer mail", authMode: "oauth",
    secretReference: "synthetic://customer/mail-secret", environment: "sandbox",
    allowedCapabilities: ["email.send"],
  }), /PROVIDER_DEFINITION_NOT_ACTIVE/);
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => call.sql.includes("INSERT INTO eper_provider_connections")));
  assert.ok(!calls.some(call => call.sql.includes("INSERT INTO eper_provider_connection_applications")));
});

test("create-and-bind rejects auth modes not declared by the provider", async () => {
  const { repository, calls } = fixture({ providerAuthModes: ["api_key"] });
  await assert.rejects(() => repository.createAndBindApplication({
    ...audit, applicationId: "app-a", providerKey: "mail-provider",
    displayName: "Customer mail", authMode: "oauth",
    secretReference: "synthetic://customer/mail-secret", environment: "sandbox",
    allowedCapabilities: ["email.send"],
  }), /PROVIDER_AUTH_MODE_NOT_SUPPORTED/);
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => call.sql.includes("INSERT INTO eper_provider_connections")));
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

test("application binding rejects suspended and deprecated provider definitions", async () => {
  for (const providerStatus of ["SUSPENDED", "DEPRECATED"]) {
    const { repository, calls } = fixture({ status: "ACTIVE", providerStatus });
    await assert.rejects(() => repository.bindApplication({
      ...audit, applicationId: "app-a", connectionId: "connection-a",
      allowedCapabilities: ["email.send"],
    }), /PROVIDER_DEFINITION_NOT_ACTIVE/);
    assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
    assert.ok(!calls.some((call) => call.sql.includes("INSERT INTO eper_provider_connection_applications")));
  }
});

test("secret rotation preserves connection identity and forces revalidation", async () => {
  const { repository, calls } = fixture();
  const rotated = await repository.rotateSecretReference({
    ...audit, applicationId: "app-a", connectionId: "connection-a", secretReference: "vault://new-version",
    expectedVersion: 1,
  });
  assert.equal(rotated.connectionId, "00000000-0000-4000-8000-000000000001");
  assert.equal(rotated.version, 2);
  assert.equal(rotated.status, "PENDING_VALIDATION");
  assert.ok(calls.some((call) => call.sql.includes("SET secret_reference")));
  assert.ok(calls.some((call) => call.sql.includes("set_config") && call.values[0] === "app-a"));
  assert.ok(calls.some((call) => call.sql.includes("SET binding_status = 'SUSPENDED'")));
});

test("stale rotation is rejected before changing the connection", async () => {
  const { repository, calls } = fixture({ version: 3 });
  await assert.rejects(() => repository.rotateSecretReference({
    ...audit, applicationId: "app-a", connectionId: "connection-a", secretReference: "vault://new-version",
    expectedVersion: 2,
  }), (error) => error instanceof ProviderConnectionConflictError && error.currentVersion === 3);
  assert.ok(!calls.some((call) => call.sql.includes("SET secret_reference")));
});

test("revocation disables all application bindings in the same audited transaction", async () => {
  const { repository, calls } = fixture();
  const revoked = await repository.revoke({
    ...audit, applicationId: "app-a", connectionId: "connection-a", expectedVersion: 1,
  });
  assert.equal(revoked.status, "REVOKED");
  assert.ok(calls.some((call) => call.sql.includes("UPDATE eper_provider_connection_applications")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((call) => call.sql.includes("set_config") && call.values[0] === "app-a"));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("invalid tenant identity is rejected before database access", async () => {
  const { repository, calls } = fixture();
  await assert.rejects(() => repository.get(" ", "connection-a"), /PROVIDER_TENANT_INVALID/);
  assert.equal(calls.length, 0);
});

test("application binding permits pending validation and records pending binding status", async () => {
  const { repository, calls } = fixture({ status: "PENDING_VALIDATION" });
  const bindingStatus = await repository.bindApplication({
    ...audit, applicationId: "app-a", connectionId: "connection-a",
    allowedCapabilities: ["email.send"],
  });
  assert.equal(bindingStatus, "PENDING_VALIDATION");
  const insert = calls.find((call) => call.sql.includes("INSERT INTO eper_provider_connection_applications"));
  assert.equal(insert.values[6], "PENDING_VALIDATION");
  assert.ok(calls.some((call) => call.sql.includes("set_config('eper.tenant_id'") && call.values[0] === "tenant-a"));
  assert.ok(calls.some((call) => call.sql.includes("set_config('eper.application_id'") && call.values[0] === "app-a"));
});


test("application listing returns only bound safe connection fields under tenant and application RLS", async () => {
  const { repository, calls } = fixture();
  const listed = await repository.listForApplication("tenant-a", "app-a");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].applicationId, "app-a");
  assert.equal(listed[0].bindingStatus, "ACTIVE");
  assert.deepEqual(listed[0].allowedCapabilities, ["email.send"]);
  assert.equal("secretReference" in listed[0], false);
  assert.ok(calls.some((call) => call.sql.includes("set_config('eper.tenant_id'") && call.values[0] === "tenant-a"));
  assert.ok(calls.some((call) => call.sql.includes("set_config('eper.application_id'") && call.values[0] === "app-a"));
  assert.ok(calls.some((call) => call.sql.includes("JOIN eper_provider_connection_applications")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("application listing rejects invalid scope before database access", async () => {
  const { repository, calls } = fixture();
  await assert.rejects(() => repository.listForApplication("tenant-a", " "), /PROVIDER_APPLICATION_ID_INVALID/);
  assert.equal(calls.length, 0);
});


test("rotation refuses to affect a connection shared by multiple applications", async () => {
  const { repository, calls } = fixture({ bindingApps: ["app-a", "app-b"] });
  await assert.rejects(() => repository.rotateSecretReference({
    ...audit, applicationId: "app-a", connectionId: "connection-a",
    secretReference: "synthetic://rotated", expectedVersion: 1,
  }), /PROVIDER_CONNECTION_SHARED_BINDING_ADMIN_REQUIRED/);
  assert.ok(!calls.some((call) => call.sql.includes("SET secret_reference")));
});

test("revocation refuses to affect a connection shared by multiple applications", async () => {
  const { repository, calls } = fixture({ bindingApps: ["app-a", "app-b"] });
  await assert.rejects(() => repository.revoke({
    ...audit, applicationId: "app-a", connectionId: "connection-a", expectedVersion: 1,
  }), /PROVIDER_CONNECTION_SHARED_BINDING_ADMIN_REQUIRED/);
  assert.ok(!calls.some((call) => call.sql.includes("SET connection_status = 'REVOKED'")));
});
