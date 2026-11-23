import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPeripheralRepository } from "../dist/packages/peripherals/postgres-peripheral-repository.js";

const input = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  actorId: "operator-1",
  environment: "sandbox",
  correlationId: "corr-peripheral-1",
  peripheralId: "peripheral-1",
  expectedVersion: 7,
  catalogueTypeKey: "barcode.scanner",
  catalogueSchemaVersion: 2,
  configuration: {
    adapterKey: "synthetic.local",
    adapterVersion: "1.0.0",
    settings: { mode: "test" },
  },
};

function fixture({ failAudit = false } = {}) {
  const calls = [];
  const registration = {
    tenant_id: "tenant-a",
    application_id: "app-a",
    peripheral_id: "peripheral-1",
    peripheral_kind: "barcode_scanner",
    display_name: "Front desk scanner",
    adapter_key: "synthetic.local",
    adapter_version: "1.0.0",
    lifecycle_status: "CONFIGURED",
    active_configuration_version: 2,
    version: 8,
  };

  const client = {
    async query(sql, values = []) {
      calls.push({ sql: String(sql), values });

      if (String(sql).includes("FROM eper_application_peripheral") &&
          String(sql).includes("FOR UPDATE")) {
        return { rows: [{ ...registration, lifecycle_status: "REGISTERED" === registration.lifecycle_status ? "REGISTERED" : "CONFIGURED", version: 7 }], rowCount: 1 };
      }

      if (String(sql).includes("coalesce(max(configuration_version)")) {
        return { rows: [{ next_version: 2 }], rowCount: 1 };
      }

      if (String(sql).includes("UPDATE eper_application_peripheral") &&
          String(sql).includes("RETURNING")) {
        return { rows: [registration], rowCount: 1 };
      }

      if (String(sql).includes("SELECT last_event_hash")) {
        return { rows: [{ last_event_hash: null }], rowCount: 1 };
      }

      if (failAudit && String(sql).includes("INSERT INTO eper_audit_events")) {
        throw new Error("AUDIT_WRITE_FAILED");
      }

      return { rows: [], rowCount: 1 };
    },
    release() {
      calls.push({ sql: "RELEASE", values: [] });
    },
  };

  const pool = {
    async connect() {
      calls.push({ sql: "CONNECT", values: [] });
      return client;
    },
  };

  return {
    calls,
    repository: new PostgresPeripheralRepository(pool),
  };
}

test("configure persists catalogue binding and audit evidence in one transaction", async () => {
  const { repository, calls } = fixture();

  await repository.configure(input);

  const roleIndex = calls.findIndex(call =>
    call.sql === "SET LOCAL ROLE eper_application_peripheral_access",
  );
  const scopeIndex = calls.findIndex(call =>
    call.sql.includes("set_config('eper.tenant_id'"),
  );
  assert.ok(roleIndex > 0, "dedicated peripheral role must be activated inside the transaction");
  assert.ok(scopeIndex > roleIndex, "tenant/application scope must be set after role activation");

  const snapshot = calls.find(call =>
    call.sql.includes("INSERT INTO eper_application_peripheral_configuration"),
  );
  assert.ok(snapshot);
  assert.match(snapshot.sql, /catalogue_type_key/);
  assert.match(snapshot.sql, /catalogue_schema_version/);
  assert.equal(snapshot.values[9], "barcode.scanner");
  assert.equal(snapshot.values[10], 2);

  const audit = calls.find(call =>
    call.sql.includes("INSERT INTO eper_audit_events"),
  );
  assert.ok(audit);
  const payload = JSON.parse(audit.values[25]);
  assert.equal(payload.catalogueTypeKey, "barcode.scanner");
  assert.equal(payload.catalogueSchemaVersion, 2);

  const commit = calls.findIndex(call => call.sql === "COMMIT");
  const auditInsert = calls.findIndex(call =>
    call.sql.includes("INSERT INTO eper_audit_events"),
  );
  assert.ok(auditInsert >= 0 && commit > auditInsert);
  assert.equal(calls.some(call => call.sql === "ROLLBACK"), false);
});

test("invalid catalogue references are rejected before database access", async () => {
  for (const change of [
    { catalogueTypeKey: "Invalid Type" },
    { catalogueSchemaVersion: 0 },
    { catalogueSchemaVersion: 1.5 },
  ]) {
    const { repository, calls } = fixture();

    await assert.rejects(
      repository.configure({ ...input, ...change }),
      /EPER_PERIPHERAL_CATALOGUE_SCHEMA_REFERENCE_INVALID/,
    );

    assert.equal(calls.some(call => call.sql === "CONNECT"), false);
  }
});

test("audit failure rolls back the configuration snapshot transaction", async () => {
  const { repository, calls } = fixture({ failAudit: true });

  await assert.rejects(
    repository.configure(input),
    /AUDIT_WRITE_FAILED/,
  );

  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_application_peripheral_configuration")));
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql === "COMMIT"), false);
});
