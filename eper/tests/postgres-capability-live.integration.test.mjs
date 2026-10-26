import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import {
  withTenantTransaction,
} from "../dist/packages/capabilities/postgres-transaction.js";
import {
  PostgresAuthoritativeRecordStore,
  PostgresAuditEvidenceStore,
} from "../dist/packages/capabilities/postgres-stores.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("live PostgreSQL capability conformance: RLS, append-only audit, rollback", { skip: !connectionString || process.env.EPER_CAPABILITY_LIVE_TESTS !== "1" }, async t => {
  const admin = new Pool({ connectionString, max: 2 });
  const role = "eper_capability_test_app";
  const tenantA = `cap-a-${randomUUID()}`;
  const tenantB = `cap-b-${randomUUID()}`;
  let app;

  try {
    // Test role must not own tables, be superuser, or bypass RLS.
    await admin.query(`
      DO $role$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
          CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
        END IF;
      END
      $role$;
    `);
    await admin.query(`ALTER ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON authoritative_records, authorization_policies, audit_evidence, workflow_exceptions, governed_reports, transactional_outbox TO ${role}`);

    app = new Pool({ connectionString, max: 3, options: `-c role=${role}` });
    const records = new PostgresAuthoritativeRecordStore(app);
    const audit = new PostgresAuditEvidenceStore(app);
    const recordId = `rec-${randomUUID()}`;
    const evidenceId = `audit-${randomUUID()}`;

    await t.test("tenant RLS hides another tenant and rejects cross-tenant writes", async () => {
      await withTenantTransaction(app, tenantA, async ({ client }) => {
        await client.query(
          "INSERT INTO authoritative_records(tenant_id,record_id,version,state,data) VALUES($1,$2,1,'OPEN','{}'::jsonb)",
          [tenantA, recordId],
        );
      });

      const fromB = await withTenantTransaction(app, tenantB, async ({ client }) => {
        const result = await client.query(
          "SELECT record_id FROM authoritative_records WHERE tenant_id=$1 AND record_id=$2",
          [tenantA, recordId],
        );
        assert.equal(result.rowCount, 0);
        await assert.rejects(
          client.query(
            "INSERT INTO authoritative_records(tenant_id,record_id,version,state,data) VALUES($1,$2,1,'OPEN','{}'::jsonb)",
            [tenantA, `cross-${randomUUID()}`],
          ),
          error => error && error.code === "42501",
        );
        return true;
      });
      assert.equal(fromB, true);
      assert.equal(await records.get(tenantB, recordId), undefined);
      assert.ok(await records.get(tenantA, recordId));
    });

    await t.test("audit UPDATE and DELETE are blocked by the database", async () => {
      const entry = await audit.append({
        id: evidenceId, tenantId: tenantA, requirementId: "LIVE-POSTGRES-TEST",
        action: "CONFORMANCE", principalId: "ci-test", correlationId: randomUUID(),
        occurredAt: new Date().toISOString(), payload: { source: "live-db", nested: { b: 2, a: 1 } },
      });
      assert.equal(audit.verify(entry), true);
      await assert.rejects(
        withTenantTransaction(app, tenantA, ({ client }) =>
          client.query("UPDATE audit_evidence SET action='ALTERED' WHERE tenant_id=$1 AND evidence_id=$2", [tenantA, evidenceId])),
        error => error && error.code === "42501",
      );
      await assert.rejects(
        withTenantTransaction(app, tenantA, ({ client }) =>
          client.query("DELETE FROM audit_evidence WHERE tenant_id=$1 AND evidence_id=$2", [tenantA, evidenceId])),
        error => error && error.code === "42501",
      );
      const roundTrip = await audit.get(tenantA, evidenceId);
      assert.ok(roundTrip);
      assert.equal(audit.verify(roundTrip), true);
      assert.equal(await audit.get(tenantB, evidenceId), undefined);
    });

    await t.test("a failed unit of work rolls back its database writes", async () => {
      const rollbackId = `rollback-${randomUUID()}`;
      await assert.rejects(
        withTenantTransaction(app, tenantA, async ({ client }) => {
          await client.query(
            "INSERT INTO authoritative_records(tenant_id,record_id,version,state,data) VALUES($1,$2,1,'OPEN','{}'::jsonb)",
            [tenantA, rollbackId],
          );
          throw new Error("INJECTED_LIVE_ROLLBACK");
        }),
        /INJECTED_LIVE_ROLLBACK/,
      );
      const check = await withTenantTransaction(app, tenantA, ({ client }) =>
        client.query("SELECT 1 FROM authoritative_records WHERE tenant_id=$1 AND record_id=$2", [tenantA, rollbackId]));
      assert.equal(check.rowCount, 0);
    });
  } finally {
    if (app) await app.end();
    // Clean test data through the owner/admin connection after app connections close.
    await admin.query("DELETE FROM transactional_outbox WHERE tenant_id = ANY($1::text[])", [[tenantA, tenantB]]).catch(() => {});
    await admin.query("DELETE FROM audit_evidence WHERE tenant_id = ANY($1::text[])", [[tenantA, tenantB]]).catch(() => {});
    await admin.query("DELETE FROM authoritative_records WHERE tenant_id = ANY($1::text[])", [[tenantA, tenantB]]).catch(() => {});
    await admin.end();
  }
});
