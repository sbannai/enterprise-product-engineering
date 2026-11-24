import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPeripheralTypeCatalogueResolver } from "../dist/packages/peripherals/postgres-peripheral-type-catalogue-resolver.js";

function createPool({ onOperation } = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes("FROM eper_peripheral_type_schema_versions")) {
        return {
          rows: [{
            type_key: "scanner.usb",
            schema_version: 2,
            adapter_key: "usb-scanner",
            adapter_version: "1.4.0",
            configuration_schema: { type: "object", properties: {} },
            compatibility: {},
          }],
        };
      }
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };

  return {
    calls,
    pool: {
      async connect() {
        calls.push({ sql: "CONNECT" });
        return client;
      },
    },
  };
}

test("resolver holds the shared catalogue lock until the operation completes", async () => {
  const { calls, pool } = createPool();
  const resolver = new PostgresPeripheralTypeCatalogueResolver(pool);

  const result = await resolver.withPublishedSchema(
    "scanner.usb",
    2,
    async (published) => {
      assert.equal(published.typeKey, "scanner.usb");
      assert.equal(published.schemaVersion, 2);
      assert.equal(published.adapterKey, "usb-scanner");
      assert.equal(calls.some((call) => call.sql === "COMMIT"), false);
      return "configuration-persisted";
    },
  );

  assert.equal(result, "configuration-persisted");

  const sql = calls.map((call) => call.sql);
  assert.ok(sql.indexOf("BEGIN READ ONLY") < sql.findIndex((q) => q.includes("pg_advisory_xact_lock_shared")));
  assert.ok(sql.findIndex((q) => q.includes("pg_advisory_xact_lock_shared")) < sql.findIndex((q) => q.includes("FROM eper_peripheral_type_schema_versions")));
  assert.ok(sql.indexOf("COMMIT") > sql.findIndex((q) => q.includes("FROM eper_peripheral_type_schema_versions")));
  assert.ok(sql.indexOf("COMMIT") < sql.indexOf("RELEASE"));
  assert.equal(calls.find((call) => call.sql.includes("pg_advisory_xact_lock_shared")).params[0], "scanner.usb");
});

test("resolver rolls back and releases the connection when the operation fails", async () => {
  const { calls, pool } = createPool();
  const resolver = new PostgresPeripheralTypeCatalogueResolver(pool);

  await assert.rejects(
    resolver.withPublishedSchema("scanner.usb", 2, async () => {
      throw new Error("configuration persistence failed");
    }),
    /configuration persistence failed/,
  );

  const sql = calls.map((call) => call.sql);
  assert.ok(sql.includes("ROLLBACK"));
  assert.equal(sql.includes("COMMIT"), false);
  assert.ok(sql.indexOf("ROLLBACK") < sql.indexOf("RELEASE"));
});
