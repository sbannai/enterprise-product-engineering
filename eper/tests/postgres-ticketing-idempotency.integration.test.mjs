import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresTicketStore } from "../dist/packages/ticketing/postgres-ticket-store.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL
  ?? process.env.EPER_TICKETING_DATABASE_URL
  ?? process.env.EPER_AUDIT_DATABASE_URL
  ?? process.env.EPER_PAYMENT_DATABASE_URL;

test("live PostgreSQL ticket creation idempotency: concurrency, conflict, tenant scope, and one audit", {
  skip: !connectionString,
}, async (t) => {
  const pool = new Pool({ connectionString, max: 8 });
  const tenant = "ticket-idem-" + randomUUID();
  const app = "app-" + randomUUID();
  const actor = "actor-" + randomUUID();
  const correlationId = "corr-" + randomUUID();
  const auditTable = "eper_ticketing_idempotency_test_audit";

  const auditWriter = async (event, client) => {
    await client.query(
      `INSERT INTO ${auditTable} (tenant_id, application_id, actor_id, ticket_id, action)
       VALUES ($1,$2,$3,$4,$5)`,
      [event.tenantId, event.applicationId, event.actorId, event.ticketId, event.action],
    );
  };
  const store = new PostgresTicketStore(pool, auditWriter);
  const identity = { tenantId: tenant, applicationId: app, actorId: actor, correlationId };
  const input = {
    type: "defect",
    title: "Ticket retry regression " + randomUUID(),
    description: "A customer retries after a network timeout.",
    businessImpact: "Avoid duplicate support tickets.",
  };
  const key = "ticket-idem-key-" + randomUUID();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${auditTable} (
        tenant_id varchar(128) NOT NULL,
        application_id varchar(128) NOT NULL,
        actor_id varchar(128) NOT NULL,
        ticket_id uuid NOT NULL,
        action varchar(64) NOT NULL
      )
    `);
    await store.assertReady();

    await t.test("parallel identical retries return the same ticket and append one audit event", async () => {
      const [first, retry] = await Promise.all([
        store.create(identity, input, key),
        store.create(identity, input, key),
      ]);
      assert.equal(first.id, retry.id);
      assert.equal(first.createdAt, retry.createdAt);
      const tickets = await pool.query(
        "SELECT count(*)::int AS count FROM eper_support_tickets WHERE tenant_id=$1 AND application_id=$2 AND created_by=$3 AND idempotency_key=$4",
        [tenant, app, actor, key],
      );
      const audits = await pool.query(
        `SELECT count(*)::int AS count FROM ${auditTable} WHERE tenant_id=$1 AND application_id=$2 AND actor_id=$3 AND ticket_id=$4 AND action='ticket.created'`,
        [tenant, app, actor, first.id],
      );
      assert.equal(tickets.rows[0].count, 1);
      assert.equal(audits.rows[0].count, 1);
    });

    await t.test("reusing a key with a different payload fails with conflict and creates no second ticket", async () => {
      await assert.rejects(
        store.create(identity, { ...input, title: input.title + " changed" }, key),
        error => error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT",
      );
      const tickets = await pool.query(
        "SELECT count(*)::int AS count FROM eper_support_tickets WHERE tenant_id=$1 AND application_id=$2 AND created_by=$3 AND idempotency_key=$4",
        [tenant, app, actor, key],
      );
      const audits = await pool.query(
        `SELECT count(*)::int AS count FROM ${auditTable} WHERE tenant_id=$1 AND application_id=$2 AND actor_id=$3 AND action='ticket.created'`,
        [tenant, app, actor],
      );
      assert.equal(tickets.rows[0].count, 1);
      assert.equal(audits.rows[0].count, 1);
    });

    await t.test("same key is isolated across tenant identities", async () => {
      const otherIdentity = { ...identity, tenantId: tenant + "-other" };
      const [firstTenant, otherTenant] = await Promise.all([
        store.create(identity, input, key),
        store.create(otherIdentity, input, key),
      ]);
      assert.notEqual(firstTenant.id, otherTenant.id);
      const count = await pool.query(
        "SELECT count(*)::int AS count FROM eper_support_tickets WHERE idempotency_key=$1 AND application_id=$2 AND created_by=$3 AND tenant_id IN ($4,$5)",
        [key, app, actor, tenant, otherIdentity.tenantId],
      );
      assert.equal(count.rows[0].count, 2);
    });

    await t.test("status and assignment mutations roll back when audit persistence fails", async () => {
      const mutationTicket = await store.create(identity, {
        ...input,
        title: "Audit rollback mutation test " + randomUUID(),
      }, "ticket-mutation-key-" + randomUUID());
      const failingAuditStore = new PostgresTicketStore(pool, async () => {
        throw new Error("injected_ticket_audit_failure");
      });

      await assert.rejects(
        failingAuditStore.changeStatus(identity, mutationTicket.id, "resolved"),
        error => error instanceof Error && error.message === "injected_ticket_audit_failure",
      );
      let persisted = await pool.query(
        "SELECT status, assigned_to FROM eper_support_tickets WHERE tenant_id=$1 AND id=$2",
        [tenant, mutationTicket.id],
      );
      assert.equal(persisted.rows[0].status, "new");
      assert.equal(persisted.rows[0].assigned_to, null);

      await assert.rejects(
        failingAuditStore.assign(identity, mutationTicket.id, "support-agent"),
        error => error instanceof Error && error.message === "injected_ticket_audit_failure",
      );
      persisted = await pool.query(
        "SELECT status, assigned_to FROM eper_support_tickets WHERE tenant_id=$1 AND id=$2",
        [tenant, mutationTicket.id],
      );
      assert.equal(persisted.rows[0].status, "new");
      assert.equal(persisted.rows[0].assigned_to, null);
    });

  } finally {
    await pool.query("DELETE FROM eper_support_tickets WHERE tenant_id = ANY($1::varchar[])", [[tenant, tenant + "-other"]]).catch(() => {});
    await pool.query(`DELETE FROM ${auditTable} WHERE tenant_id = ANY($1::varchar[])`, [[tenant, tenant + "-other"]]).catch(() => {});
    await pool.end();
  }
});
