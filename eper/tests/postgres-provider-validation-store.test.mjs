import assert from "node:assert/strict";
import test from "node:test";
import { PostgresProviderValidationStore } from "../dist/packages/integrations/postgres-provider-validation-store.js";

const stamp = "2026-11-02T15:00:00.000Z";

function fixture({ version = 4, status = "PENDING_VALIDATION", exists = true } = {}) {
  const calls = [];
  let currentVersion = version;
  let currentStatus = status;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT c.tenant_id, c.connection_id, c.provider_key, d.adapter_key")) {
        return { rows: exists && values[1] === "app-a" ? [{
          tenant_id: "tenant-a", connection_id: "connection-a", provider_key: "mail",
          adapter_key: "mail-adapter", adapter_version: "1.0.0", auth_mode: "oauth",
          secret_reference: "vault://tenant-a/mail/credential", environment: "sandbox",
          safe_metadata: { region: "ap-south" }, connection_status: currentStatus,
          version: currentVersion,
        }] : [], rowCount: exists && values[1] === "app-a" ? 1 : 0 };
      }
      if (sql.includes("UPDATE eper_provider_connections")) {
        const [tenant, connection, expected, nextStatus] = values;
        if (exists && tenant === "tenant-a" && connection === "connection-a" &&
            currentVersion === expected &&
            ["PENDING_VALIDATION", "ACTIVE", "DEGRADED"].includes(currentStatus)) {
          currentVersion += 1; currentStatus = nextStatus;
          return { rows: [{ provider_key: "mail", connection_status: currentStatus, version: currentVersion }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT version, connection_status FROM eper_provider_connections")) {
        return { rows: exists ? [{ version: currentVersion, connection_status: currentStatus }] : [], rowCount: exists ? 1 : 0 };
      }
      if (sql.includes("SELECT last_event_hash")) {
        return { rows: [{ last_event_hash: "previous-hash" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return {
    store: new PostgresProviderValidationStore({ async connect() { return client; } }),
    calls,
    state: () => ({ currentVersion, currentStatus }),
  };
}

const common = {
  tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a", actorId: "admin-a",
  correlationId: "corr-a", auditEnvironment: "sandbox",
};

test("reads a tenant-scoped internal validation snapshot with adapter and secret reference", async () => {
  const { store, calls } = fixture();
  const snapshot = await store.getValidationSnapshot("tenant-a", "app-a", "connection-a");
  assert.equal(snapshot.adapterKey, "mail-adapter");
  assert.equal(snapshot.secretReference, "vault://tenant-a/mail/credential");
  assert.equal(snapshot.version, 4);
  assert.ok(calls.some((call) => call.sql.includes("set_config('eper.tenant_id'")));
  assert.ok(calls.some((call) => call.sql.includes("set_config('eper.application_id'") && call.values[0] === "app-a"));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("successful validation atomically activates, versions, records history and audits", async () => {
  const { store, calls, state } = fixture();
  const result = await store.recordValidationOutcome({
    ...common, expectedVersion: 4, outcome: "SUCCEEDED",
  });
  assert.deepEqual(result, { status: "ACTIVE", version: 5 });
  const update = calls.find((call) => call.sql.includes("UPDATE eper_provider_connections"));
  assert.equal(update.values[5], "app-a");
  assert.deepEqual(state(), { currentVersion: 5, currentStatus: "ACTIVE" });
  assert.ok(calls.some((call) => call.sql.includes("UPDATE eper_provider_connection_applications") && call.values[2] === "app-a"));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_provider_validation_events")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("failed validation persists only a stable error code and degrades the connection", async () => {
  const { store, calls } = fixture();
  const result = await store.recordValidationOutcome({
    ...common, expectedVersion: 4, outcome: "FAILED", errorCode: "AUTH_REJECTED",
  });
  assert.deepEqual(result, { status: "DEGRADED", version: 5 });
  const history = calls.find((call) => call.sql.includes("INSERT INTO eper_provider_validation_events"));
  assert.equal(history.values[7], "AUTH_REJECTED");
});

test("stale validation cannot overwrite a concurrent credential rotation", async () => {
  const { store, calls, state } = fixture({ version: 5, status: "PENDING_VALIDATION" });
  await assert.rejects(() => store.recordValidationOutcome({
    ...common, expectedVersion: 4, outcome: "SUCCEEDED",
  }), /PROVIDER_CONNECTION_VERSION_CONFLICT/);
  assert.deepEqual(state(), { currentVersion: 5, currentStatus: "PENDING_VALIDATION" });
  assert.ok(!calls.some((call) => call.sql.includes("INSERT INTO eper_provider_validation_events")));
  assert.ok(!calls.some((call) => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
});

test("revoked connection rejects a stale validation outcome", async () => {
  const { store, calls } = fixture({ version: 5, status: "REVOKED" });
  await assert.rejects(() => store.recordValidationOutcome({
    ...common, expectedVersion: 4, outcome: "SUCCEEDED",
  }), /PROVIDER_CONNECTION_NOT_VALIDATABLE/);
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
});

test("missing connection is distinguished from a stale version", async () => {
  const { store } = fixture({ exists: false });
  await assert.rejects(() => store.recordValidationOutcome({
    ...common, expectedVersion: 4, outcome: "SUCCEEDED",
  }), /PROVIDER_CONNECTION_NOT_FOUND/);
});

test("failed outcome requires a safe error code", async () => {
  const { store, calls } = fixture();
  await assert.rejects(() => store.recordValidationOutcome({
    ...common, expectedVersion: 4, outcome: "FAILED", errorCode: "token=private",
  }), /PROVIDER_VALIDATION_ERROR_CODE_INVALID/);
  assert.ok(!calls.some((call) => call.sql.includes("UPDATE eper_provider_connections")));
});


test("snapshot lookup cannot see a provider connection without the requested application binding", async () => {
  const { store, calls } = fixture();
  const snapshot = await store.getValidationSnapshot("tenant-a", "app-b", "connection-a");
  assert.equal(snapshot, null);
  assert.ok(calls.some((call) => call.sql.includes("b.application_id = $2") && call.values[1] === "app-b"));
});
