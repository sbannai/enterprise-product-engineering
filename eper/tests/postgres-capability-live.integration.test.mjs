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
  PostgresExceptionStore,
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
        occurredAt: "2026-10-27T12:34:56.123456+05:30",
        payload: { source: "live-db", nested: { b: 2, a: 1 } },
      });
      assert.equal(audit.verify(entry), true, "offset timestamps must hash in canonical UTC form");
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
      assert.equal(roundTrip.occurredAt, "2026-10-27T07:04:56.123Z", "PostgreSQL normalizes the offset and fractional precision");
      assert.equal(audit.verify(roundTrip), true, "the integrity hash must survive timestamp and JSONB normalization");
      assert.equal(await audit.get(tenantB, evidenceId), undefined);
    });

    await t.test("concurrent exception creates replay one committed result per tenant/idempotency key", async () => {
      const exceptions = new PostgresExceptionStore(app);
      const id = `exception-${randomUUID()}`;
      const createdAt = new Date().toISOString();
      const input = {
        id, tenantId: tenantA, requirementId: "LIVE-POSTGRES-TEST", code: "CONCURRENT",
        message: "same idempotent request", idempotencyKey: `idem-${randomUUID()}`, createdAt,
      };
      const [first, second] = await Promise.all([
        exceptions.create(input, "corr-live-concurrent", "ci-test"),
        exceptions.create(input, "corr-live-concurrent", "ci-test"),
      ]);
      assert.equal(first.id, second.id);
      assert.equal(first.state, second.state);
      const counts = await withTenantTransaction(app, tenantA, async ({ client }) => {
        const domain = await client.query(
          "SELECT count(*)::int AS count FROM workflow_exceptions WHERE tenant_id=$1 AND exception_id=$2",
          [tenantA, id],
        );
        const auditRows = await client.query(
          "SELECT count(*)::int AS count FROM audit_evidence WHERE tenant_id=$1 AND action='EXCEPTION_CREATED' AND payload @> $2::jsonb",
          [tenantA, JSON.stringify({ exceptionId: id })],
        );
        const outboxRows = await client.query(
          "SELECT count(*)::int AS count FROM transactional_outbox WHERE tenant_id=$1 AND aggregate_type='workflow_exception' AND aggregate_id=$2 AND event_type='EXCEPTION_CREATED'",
          [tenantA, id],
        );
        return { domain: domain.rows[0].count, audit: auditRows.rows[0].count, outbox: outboxRows.rows[0].count };
      });
      assert.deepEqual(counts, { domain: 1, audit: 1, outbox: 1 });
    });

    await t.test("outbox insert failure rolls back exception and audit state", async () => {
      const exceptions = new PostgresExceptionStore(app);
      const id = `outbox-fail-${randomUUID()}`;
      const suffix = randomUUID().replaceAll("-", "");
      const functionName = `eper_test_outbox_fail_${suffix}`;
      const triggerName = `eper_test_outbox_trigger_${suffix}`;
      await admin.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $inject$
        BEGIN
          IF NEW.aggregate_id = '${id}' THEN
            RAISE EXCEPTION 'INJECTED_OUTBOX_FAILURE' USING ERRCODE = 'P0001';
          END IF;
          RETURN NEW;
        END
        $inject$;
      `);
      await admin.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON transactional_outbox FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
      try {
        await assert.rejects(exceptions.create({
          id, tenantId: tenantA, requirementId: "LIVE-POSTGRES-TEST", code: "OUTBOX-FAIL",
          message: "outbox failure injection", idempotencyKey: `idem-${randomUUID()}`,
          createdAt: new Date().toISOString(),
        }, "corr-live-outbox-failure", "ci-test"), /INJECTED_OUTBOX_FAILURE/);
        const counts = await withTenantTransaction(app, tenantA, async ({ client }) => {
          const domain = await client.query("SELECT count(*)::int AS count FROM workflow_exceptions WHERE tenant_id=$1 AND exception_id=$2", [tenantA, id]);
          const auditRows = await client.query("SELECT count(*)::int AS count FROM audit_evidence WHERE tenant_id=$1 AND action='EXCEPTION_CREATED' AND payload @> $2::jsonb", [tenantA, JSON.stringify({ exceptionId: id })]);
          const outboxRows = await client.query("SELECT count(*)::int AS count FROM transactional_outbox WHERE tenant_id=$1 AND aggregate_id=$2", [tenantA, id]);
          return { domain: domain.rows[0].count, audit: auditRows.rows[0].count, outbox: outboxRows.rows[0].count };
        });
        assert.deepEqual(counts, { domain: 0, audit: 0, outbox: 0 });
      } finally {
        await admin.query(`DROP TRIGGER IF EXISTS ${triggerName} ON transactional_outbox`);
        await admin.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
      }
    });

    await t.test("audit insert failure rolls back exception state before outbox publication", async () => {
      const exceptions = new PostgresExceptionStore(app);
      const id = `audit-fail-${randomUUID()}`;
      const suffix = randomUUID().replaceAll("-", "");
      const functionName = `eper_test_audit_fail_${suffix}`;
      const triggerName = `eper_test_audit_trigger_${suffix}`;
      await admin.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $inject$
        BEGIN
          IF NEW.payload->>'exceptionId' = '${id}' THEN
            RAISE EXCEPTION 'INJECTED_AUDIT_FAILURE' USING ERRCODE = 'P0001';
          END IF;
          RETURN NEW;
        END
        $inject$;
      `);
      await admin.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_evidence FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
      try {
        await assert.rejects(exceptions.create({
          id, tenantId: tenantA, requirementId: "LIVE-POSTGRES-TEST", code: "AUDIT-FAIL",
          message: "audit failure injection", idempotencyKey: `idem-${randomUUID()}`,
          createdAt: new Date().toISOString(),
        }, "corr-live-audit-failure", "ci-test"), /INJECTED_AUDIT_FAILURE/);
        const counts = await withTenantTransaction(app, tenantA, async ({ client }) => {
          const domain = await client.query("SELECT count(*)::int AS count FROM workflow_exceptions WHERE tenant_id=$1 AND exception_id=$2", [tenantA, id]);
          const auditRows = await client.query("SELECT count(*)::int AS count FROM audit_evidence WHERE tenant_id=$1 AND action='EXCEPTION_CREATED' AND payload @> $2::jsonb", [tenantA, JSON.stringify({ exceptionId: id })]);
          const outboxRows = await client.query("SELECT count(*)::int AS count FROM transactional_outbox WHERE tenant_id=$1 AND aggregate_id=$2", [tenantA, id]);
          return { domain: domain.rows[0].count, audit: auditRows.rows[0].count, outbox: outboxRows.rows[0].count };
        });
        assert.deepEqual(counts, { domain: 0, audit: 0, outbox: 0 });
      } finally {
        await admin.query(`DROP TRIGGER IF EXISTS ${triggerName} ON audit_evidence`);
        await admin.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
      }
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
