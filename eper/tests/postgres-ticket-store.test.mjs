import test from "node:test";
import assert from "node:assert/strict";
import { PostgresTicketStore } from "../dist/packages/ticketing/postgres-ticket-store.js";

const ticketRow = {
  id: "ticket-1", tenant_id: "tenant-a", application_id: "app-a", created_by: "actor-a",
  type: "feedback", title: "A title", description: "A description", business_impact: "Impact",
  evidence_reference: null, status: "new", severity: "p3", assigned_to: null,
  created_at: "2026-10-26T00:00:00.000Z", updated_at: "2026-10-26T00:00:00.000Z",
};

function fakePool({ failAudit = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/INSERT INTO eper_support_tickets/.test(sql)) return { rows: [{ ...ticketRow, id: values[0], tenant_id: values[1], application_id: values[2], created_by: values[3] }], rowCount: 1 };
      if (/UPDATE eper_support_tickets/.test(sql)) return { rows: [{ ...ticketRow, tenant_id: values[0], id: values[1] }], rowCount: 1 };
      if (failAudit && /eper_audit_events/.test(sql)) throw new Error("audit write failed");
      if (/SELECT \* FROM eper_support_tickets/.test(sql)) return { rows: [ticketRow], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { calls, pool: { async connect() { return client; } }, client };
}

const identity = { tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a", correlationId: "corr-1" };
const input = { type: "feedback", title: "Title", description: "Description", businessImpact: "Impact" };

test("ticket create sends canonical audit write through the same transaction client", async () => {
  const { calls, pool, client } = fakePool();
  let auditClient;
  const store = new PostgresTicketStore(pool, async (_event, txClient) => {
    auditClient = txClient;
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-test')");
  });
  const ticket = await store.create(identity, input);
  assert.equal(ticket.tenantId, "tenant-a");
  assert.equal(auditClient, client);
  const sql = calls.map((x) => x.sql);
  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.some((x) => /INSERT INTO eper_support_tickets/.test(x)));
  assert.ok(sql.some((x) => /INSERT INTO eper_audit_events/.test(x)));
  assert.ok(sql.includes("COMMIT"));
  assert.ok(!sql.includes("ROLLBACK"));
});

test("ticket mutation rolls back when the canonical audit write fails", async () => {
  const { calls, pool } = fakePool({ failAudit: true });
  const store = new PostgresTicketStore(pool, async (_event, txClient) => {
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-test')");
  });
  await assert.rejects(() => store.create(identity, input), /audit write failed/);
  const sql = calls.map((x) => x.sql);
  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.includes("ROLLBACK"));
  assert.ok(!sql.includes("COMMIT"));
});

test("ticket listing always scopes by trusted tenant and selected application", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresTicketStore(pool, async () => {});
  const tickets = await store.list({ tenantId: "tenant-a" }, { applicationId: "app-a", limit: 20, offset: 0 });
  assert.equal(tickets.length, 1);
  const query = calls.find((x) => /SELECT \* FROM eper_support_tickets/.test(x.sql));
  assert.ok(query);
  assert.match(query.sql, /tenant_id = \$1/);
  assert.match(query.sql, /application_id = \$2/);
  assert.deepEqual(query.values, ["tenant-a", "app-a", 20, 0]);
});

test("ticket status changes are tenant scoped and audit uses the same transaction", async () => {
  const { calls, pool, client } = fakePool();
  let auditClient;
  const store = new PostgresTicketStore(pool, async (_event, txClient) => {
    auditClient = txClient;
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-test')");
  });
  const updated = await store.changeStatus(identity, "ticket-1", "triaged");
  assert.equal(updated?.tenantId, "tenant-a");
  assert.equal(auditClient, client);
  const update = calls.find((x) => /UPDATE eper_support_tickets/.test(x.sql));
  assert.match(update.sql, /WHERE tenant_id = \$1 AND id = \$2/);
  assert.deepEqual(update.values, ["tenant-a", "ticket-1", "triaged"]);
});


test("ticket assignment records actor, tenant, correlation and assignee in the same transaction", async () => {
  const { calls, pool, client } = fakePool();
  let auditEvent;
  let auditClient;
  const store = new PostgresTicketStore(pool, async (event, txClient) => {
    auditEvent = event;
    auditClient = txClient;
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-test')");
  });
  const updated = await store.assign(identity, "ticket-1", "support-2");
  assert.equal(updated?.tenantId, "tenant-a");
  assert.equal(auditClient, client);
  assert.deepEqual(auditEvent, {
    tenantId: "tenant-a",
    applicationId: "app-a",
    actorId: "actor-a",
    correlationId: "corr-1",
    action: "ticket.assigned",
    ticketId: "ticket-1",
    outcome: "success",
    payload: { assignedTo: "support-2" },
  });
  const update = calls.find((x) => /UPDATE eper_support_tickets/.test(x.sql));
  assert.match(update.sql, /WHERE tenant_id = \$1 AND id = \$2/);
  assert.ok(calls.some((x) => x.sql === "COMMIT"));
});

test("ticket assignment rolls back if audit persistence fails", async () => {
  const { calls, pool } = fakePool({ failAudit: true });
  const store = new PostgresTicketStore(pool, async (_event, txClient) => {
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-test')");
  });
  await assert.rejects(() => store.assign(identity, "ticket-1", "support-2"), /audit write failed/);
  const sql = calls.map((x) => x.sql);
  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.includes("ROLLBACK"));
  assert.ok(!sql.includes("COMMIT"));
});


test("ticket status change audit captures the transition and trusted request context", async () => {
  const { calls, pool, client } = fakePool();
  let event;
  let eventClient;
  const store = new PostgresTicketStore(pool, async (auditEvent, txClient) => {
    event = auditEvent;
    eventClient = txClient;
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-test')");
  });
  await store.changeStatus(identity, "ticket-1", "triaged");
  assert.equal(eventClient, client);
  assert.deepEqual(event, {
    tenantId: "tenant-a",
    applicationId: "app-a",
    actorId: "actor-a",
    correlationId: "corr-1",
    action: "ticket.status_changed",
    ticketId: "ticket-1",
    outcome: "success",
    payload: { newStatus: "triaged" },
  });
  assert.ok(calls.some((x) => x.sql === "COMMIT"));
});

test("missing tenant-scoped ticket does not emit a success audit event", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/UPDATE eper_support_tickets/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  let auditCalls = 0;
  const store = new PostgresTicketStore(pool, async () => { auditCalls++; });
  assert.equal(await store.changeStatus(identity, "ticket-from-other-tenant", "triaged"), null);
  assert.equal(auditCalls, 0);
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
  assert.ok(!calls.some((x) => x.sql === "COMMIT"));
});
