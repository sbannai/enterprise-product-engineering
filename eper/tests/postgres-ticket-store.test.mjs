import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("ticket listing searches title, description, business impact, ID, application and assignee using a bound value", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresTicketStore(pool, async () => {});
  await store.list({ tenantId: "tenant-a" }, { search: "payment timeout", limit: 10, offset: 0 });
  const query = calls.find((x) => /SELECT \* FROM eper_support_tickets/.test(x.sql));
  assert.ok(query);
  assert.match(query.sql, /position\(lower\(\$2\) in lower\(id::text\)\) > 0/);
  assert.match(query.sql, /lower\(business_impact\)/);
  assert.match(query.sql, /lower\(coalesce\(assigned_to, ''\)\)/);
  assert.deepEqual(query.values, ["tenant-a", "payment timeout", 10, 0]);
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


test("ticket listing fails closed without an explicit tenant or authorized cross-tenant scope", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresTicketStore(pool, async () => {});
  await assert.rejects(() => store.list({}), /ticket_tenant_scope_required/);
  await assert.rejects(() => store.list({ tenantId: "" }), /ticket_tenant_scope_required/);
  await assert.rejects(() => store.list({ tenantId: " tenant-a" }), /ticket_tenant_scope_required/);
  assert.equal(calls.length, 0, "invalid scope must fail before issuing SQL");
});

test("cross-tenant ticket listing requires the explicit privileged scope marker", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresTicketStore(pool, async () => {});
  await store.list({ crossTenant: true }, { limit: 10, offset: 0 });
  const query = calls.find((x) => /SELECT \* FROM eper_support_tickets/.test(x.sql));
  assert.ok(query);
  assert.doesNotMatch(query.sql, /WHERE tenant_id/);
  assert.deepEqual(query.values, [10, 0]);
});

test("ticket store accepts the bounded pagination lookahead row and binds it as a parameter", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresTicketStore(pool, async () => {});
  await store.list({ tenantId: "tenant-a" }, { limit: 101, offset: 200 });
  const query = calls.find((x) => /SELECT \* FROM eper_support_tickets/.test(x.sql));
  assert.ok(query);
  assert.deepEqual(query.values, ["tenant-a", 101, 200]);
  await assert.rejects(
    () => store.list({ tenantId: "tenant-a" }, { limit: 102, offset: 200 }),
    /invalid_ticket_pagination/,
  );
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


test("canonical ticket audit adapter writes the append-only EPER audit envelope", async () => {
  const { createCanonicalTicketAuditWriter } = await import("../dist/packages/ticketing/postgres-ticket-store.js");
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT last_event_hash FROM eper_audit_chain_head/.test(sql)) {
        return { rows: [{ last_event_hash: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const writer = createCanonicalTicketAuditWriter("uat", "test-version");
  await writer({
    tenantId: "tenant-a",
    applicationId: "app-a",
    actorId: "actor-a",
    correlationId: "corr-1",
    action: "ticket.assigned",
    ticketId: "ticket-1",
    outcome: "success",
    payload: { assignedTo: "support-2" },
  }, client);
  const insert = calls.find((x) => /INSERT INTO eper_audit_events/.test(x.sql));
  assert.ok(insert, "must use the canonical append-only audit table");
  assert.match(insert.sql, /previous_event_hash, event_hash, integrity_metadata/);
  assert.equal(insert.values[2], "tenant-a");
  assert.equal(insert.values[3], "app-a");
  assert.equal(insert.values[4], "uat");
  assert.equal(insert.values[6], "actor-a");
  assert.equal(insert.values[8], "ticket.assigned");
  assert.equal(insert.values[9], "success");
  assert.equal(insert.values[14], "corr-1");
  assert.equal(insert.values[16], "api");
  assert.equal(insert.values[17], "ticket.assigned");
  assert.equal(insert.values[18], "test-version");
  assert.equal(insert.values[11], "support_ticket");
  assert.equal(insert.values[12], "ticket-1");
  assert.deepEqual(JSON.parse(insert.values[25]), { assignedTo: "support-2" });
  assert.ok(calls.some((x) => /UPDATE eper_audit_chain_head/.test(x.sql)));
});


test("canonical audit-chain failure rolls back the ticket mutation", async () => {
  const { createCanonicalTicketAuditWriter, PostgresTicketStore } = await import("../dist/packages/ticketing/postgres-ticket-store.js");
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/INSERT INTO eper_support_tickets/.test(sql)) {
        return { rows: [{ ...ticketRow, id: values[0], tenant_id: values[1], application_id: values[2], created_by: values[3] }], rowCount: 1 };
      }
      if (/SELECT last_event_hash FROM eper_audit_chain_head/.test(sql)) {
        return { rows: [{ last_event_hash: null }], rowCount: 1 };
      }
      if (/INSERT INTO eper_audit_events/.test(sql)) throw new Error("canonical audit unavailable");
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const store = new PostgresTicketStore(pool, createCanonicalTicketAuditWriter("uat", "test-version"));
  await assert.rejects(() => store.create(identity, input), /canonical audit unavailable/);
  const sql = calls.map((x) => x.sql);
  assert.ok(sql.some((x) => /INSERT INTO eper_support_tickets/.test(x)));
  assert.ok(sql.some((x) => /INSERT INTO eper_audit_events/.test(x)));
  assert.ok(sql.includes("ROLLBACK"));
  assert.ok(!sql.includes("COMMIT"));
});


test("ticket status change rolls back if canonical audit persistence fails", async () => {
  const { calls, pool } = fakePool({ failAudit: true });
  const store = new PostgresTicketStore(pool, async (_event, txClient) => {
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-test')");
  });
  await assert.rejects(() => store.changeStatus(identity, "ticket-1", "triaged"), /audit write failed/);
  const sql = calls.map((x) => x.sql);
  assert.ok(sql.some((x) => /UPDATE eper_support_tickets/.test(x)));
  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.includes("ROLLBACK"));
  assert.ok(!sql.includes("COMMIT"));
});

test("ticket assignment cannot mutate or audit a ticket outside the trusted tenant", async () => {
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
  assert.equal(await store.assign(identity, "ticket-from-other-tenant", "support-2"), null);
  assert.equal(auditCalls, 0);
  const update = calls.find((x) => /UPDATE eper_support_tickets/.test(x.sql));
  assert.match(update.sql, /WHERE tenant_id = \$1 AND id = \$2/);
  assert.deepEqual(update.values, ["tenant-a", "ticket-from-other-tenant", "support-2"]);
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
  assert.ok(!calls.some((x) => x.sql === "COMMIT"));
});


function ticketRequestHash(value = input) {
  return createHash("sha256").update(JSON.stringify({
    type: value.type, title: value.title, description: value.description,
    businessImpact: value.businessImpact, evidenceReference: value.evidenceReference ?? null,
  })).digest("hex");
}

function idempotencyConflictPool(existingHash) {
  const calls = [];
  const existing = { ...ticketRow, request_hash: existingHash };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/INSERT INTO eper_support_tickets/.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT \*, request_hash FROM eper_support_tickets/.test(sql)) return { rows: [existing], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("idempotent ticket replay returns the original ticket without writing a second audit event", async () => {
  const { calls, pool } = idempotencyConflictPool(ticketRequestHash());
  let auditCalls = 0;
  const store = new PostgresTicketStore(pool, async () => { auditCalls++; });
  const replay = await store.create(identity, input, "stable-key-1234567890");
  assert.equal(replay.id, "ticket-1");
  assert.equal(replay.tenantId, "tenant-a");
  assert.equal(auditCalls, 0, "replaying a committed ticket must not emit a second creation audit event");
  assert.ok(calls.some((x) => /ON CONFLICT/.test(x.sql)));
  assert.ok(calls.some((x) => /FOR UPDATE/.test(x.sql)));
  assert.ok(calls.some((x) => x.sql === "COMMIT"));
  assert.ok(!calls.some((x) => x.sql === "ROLLBACK"));
});

test("idempotency key replay with changed payload fails closed and rolls back", async () => {
  const { calls, pool } = idempotencyConflictPool(ticketRequestHash());
  let auditCalls = 0;
  const store = new PostgresTicketStore(pool, async () => { auditCalls++; });
  await assert.rejects(
    () => store.create(identity, { ...input, title: "Changed title" }, "stable-key-1234567890"),
    /IDEMPOTENCY_KEY_CONFLICT/,
  );
  assert.equal(auditCalls, 0);
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
  assert.ok(!calls.some((x) => x.sql === "COMMIT"));
});


test("ticket reply is tenant-scoped and commits with its audit event", async () => {
  const calls = [];
  const ticket = { application_id: "app-a" };
  const replyRow = {
    id: "reply-1", tenant_id: "tenant-a", application_id: "app-a", ticket_id: "ticket-1",
    author_id: "support-2", author_role: "support", body: "We are investigating",
    created_at: "2026-10-26T10:00:00.000Z",
  };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT application_id FROM eper_support_tickets/.test(sql)) return { rows: [ticket], rowCount: 1 };
      if (/INSERT INTO eper_support_ticket_replies/.test(sql)) return { rows: [replyRow], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const auditEvents = [];
  const store = new PostgresTicketStore(pool, async (event, txClient) => {
    auditEvents.push(event);
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-test')");
  });
  const reply = await store.addReply(identity, "ticket-1", "We are investigating", "support");
  assert.equal(reply.ticketId, "ticket-1");
  assert.equal(reply.authorRole, "support");
  assert.equal(reply.body, "We are investigating");
  const insert = calls.find((x) => /INSERT INTO eper_support_ticket_replies/.test(x.sql));
  assert.deepEqual(insert.values.slice(1), ["tenant-a", "app-a", "ticket-1", "actor-a", "support", "We are investigating", "customer_visible"]);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].action, "ticket.replied");
  assert.deepEqual(auditEvents[0].payload, { replyId: "reply-1", authorRole: "support", visibility: "customer_visible" });
  assert.ok(calls.some((x) => x.sql === "COMMIT"));
  assert.ok(!calls.some((x) => x.sql === "ROLLBACK"));
});

test("ticket reply cannot cross tenant or application boundaries", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT application_id FROM eper_support_tickets/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  let auditCalls = 0;
  const store = new PostgresTicketStore(pool, async () => { auditCalls++; });
  assert.equal(await store.addReply(identity, "ticket-outside-scope", "hello", "customer"), null);
  const select = calls.find((x) => /SELECT application_id FROM eper_support_tickets/.test(x.sql));
  assert.match(select.sql, /tenant_id = \$1 AND id = \$2 AND \(\$3 = 'eper' OR application_id = \$3\)/);
  assert.deepEqual(select.values, ["tenant-a", "ticket-outside-scope", "app-a"]);
  assert.equal(auditCalls, 0);
  assert.ok(calls.some((x) => x.sql === "ROLLBACK"));
  assert.ok(!calls.some((x) => /INSERT INTO eper_support_ticket_replies/.test(x.sql)));
});


test("ticket conversation reads are tenant and application scoped and ordered chronologically", async () => {
  const calls = [];
  const replyRows = [
    { id: "reply-1", tenant_id: "tenant-a", application_id: "app-a", ticket_id: "ticket-1", author_id: "actor-a", author_role: "customer", body: "First", created_at: "2026-10-26T10:00:00.000Z" },
    { id: "reply-2", tenant_id: "tenant-a", application_id: "app-a", ticket_id: "ticket-1", author_id: "support-a", author_role: "support", body: "Second", created_at: "2026-10-26T10:01:00.000Z" },
  ];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT id FROM eper_support_tickets/.test(sql)) return { rows: [{ id: "ticket-1" }], rowCount: 1 };
      if (/SELECT \* FROM eper_support_ticket_replies/.test(sql)) return { rows: replyRows, rowCount: 2 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const store = new PostgresTicketStore(pool, async () => {});
  const replies = await store.listReplies(identity, "ticket-1");
  assert.deepEqual(replies.map(reply => reply.body), ["First", "Second"]);
  const ticketCheck = calls.find(call => /SELECT id FROM eper_support_tickets/.test(call.sql));
  assert.match(ticketCheck.sql, /tenant_id = \$1 AND id = \$2 AND \(\$3 = 'eper' OR application_id = \$3\)/);
  assert.deepEqual(ticketCheck.values, ["tenant-a", "ticket-1", "app-a"]);
  const threadRead = calls.find(call => /SELECT \* FROM eper_support_ticket_replies/.test(call.sql));
  assert.match(threadRead.sql, /tenant_id = \$1 AND ticket_id = \$2 ORDER BY created_at ASC, id ASC/);
  assert.deepEqual(threadRead.values, ["tenant-a", "ticket-1"]);
});

test("ticket conversation read returns not-found without reading replies for a ticket outside scope", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT id FROM eper_support_tickets/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const store = new PostgresTicketStore(pool, async () => {});
  assert.equal(await store.listReplies(identity, "ticket-outside-scope"), null);
  assert.equal(calls.filter(call => /SELECT \* FROM eper_support_ticket_replies/.test(call.sql)).length, 0);
  assert.deepEqual(calls[0].values, ["tenant-a", "ticket-outside-scope", "app-a"]);
});


test("P1 classification persists rationale and trusted confirmation metadata atomically with audit", async () => {
  const calls = [];
  const row = {
    ...ticketRow, type: "defect", evidence_reference: "evidence://repro-123", severity: "p1_confirmed",
    p1_rationale: "Payment integrity is blocked for all users and receipts cannot be reconciled.",
    p1_confirmed_by: "actor-a",
    p1_confirmed_at: "2026-10-31T16:00:00.000Z",
  };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT severity, type, evidence_reference FROM eper_support_tickets/.test(sql)) return { rows: [{ severity: "p1_candidate", type: "defect", evidence_reference: "evidence://repro-123" }], rowCount: 1 };
      if (/UPDATE eper_support_tickets/.test(sql)) return { rows: [row], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const auditEvents = [];
  const store = new PostgresTicketStore(pool, async (event, txClient) => {
    auditEvents.push(event);
    await txClient.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-p1')");
  });
  const rationale = row.p1_rationale;
  const result = await store.classifySeverity(identity, "ticket-1", "p1_confirmed", rationale);
  assert.equal(result.severity, "p1_confirmed");
  assert.equal(result.p1Rationale, rationale);
  assert.equal(result.p1ConfirmedBy, "actor-a");
  assert.equal(result.p1ConfirmedAt, "2026-10-31T16:00:00.000Z");
  assert.deepEqual(calls.find(x => /UPDATE eper_support_tickets/.test(x.sql)).values,
    ["tenant-a", "ticket-1", "p1_confirmed", rationale, "actor-a"]);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].action, "ticket.severity_classified");
  assert.equal(auditEvents[0].payload.previousSeverity, "p1_candidate");
  assert.equal(auditEvents[0].payload.confirmedBy, "actor-a");
  assert.ok(calls.some(x => x.sql === "COMMIT"));
  assert.ok(!calls.some(x => x.sql === "ROLLBACK"));
});

test("P1 confirmation without substantive rationale is rejected before database access", async () => {
  let connections = 0;
  const pool = { async connect() { connections++; throw new Error("must not connect"); } };
  const store = new PostgresTicketStore(pool, async () => {});
  await assert.rejects(
    () => store.classifySeverity(identity, "ticket-1", "p1_confirmed", "Too short"),
    /ticket_severity_rationale_required/,
  );
  assert.equal(connections, 0);
});


test("P1 confirmation rejects non-defects or missing evidence references", async () => {
  for (const ticketDetails of [
    { type: "feature_request", evidence_reference: "evidence://repro-123" },
    { type: "defect", evidence_reference: null },
  ]) {
    const client = {
      async query(sql) {
        if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 1 };
        if (/SELECT severity, type, evidence_reference FROM eper_support_tickets/.test(sql)) {
          return { rows: [{ severity: "p1_candidate", ...ticketDetails }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release() {},
    };
    const store = new PostgresTicketStore({ async connect() { return client; } }, async () => {});
    await assert.rejects(
      () => store.classifySeverity(identity, "ticket-1", "p1_confirmed", "Evidence indicates severe impact to payment integrity."),
      /ticket_p1_evidence_required/,
    );
  }
});


test("duplicate disposition requires a same-tenant canonical ticket and writes audit atomically", async () => {
  const calls = [], auditEvents = [];
  const row = { ...ticketRow, id: "ticket-1", duplicate_disposition: "duplicate",
    canonical_ticket_id: "223e4567-e89b-12d3-a456-426614174000",
    duplicate_rationale: "Same payment receipt failure and reproduction as canonical ticket.",
    duplicate_disposition_by: "actor-a", duplicate_disposition_at: "2026-10-31T16:00:00.000Z" };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT id, application_id, duplicate_disposition FROM eper_support_tickets/.test(sql)) {
        return { rows: [{ id: "ticket-1", application_id: "app-a", duplicate_disposition: "needs_review" }], rowCount: 1 };
      }
      if (/SELECT id, duplicate_disposition FROM eper_support_tickets/.test(sql)) {
        return { rows: [{ id: values[2], duplicate_disposition: "distinct" }], rowCount: 1 };
      }
      if (/UPDATE eper_support_tickets/.test(sql)) return { rows: [row], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }, release() {},
  };
  const store = new PostgresTicketStore({ async connect() { return client; } }, async (event, tx) => {
    auditEvents.push(event); await tx.query("INSERT INTO eper_audit_events (event_id) VALUES ('audit-duplicate')");
  });
  const result = await store.setDuplicateDisposition(identity, "ticket-1", "duplicate",
    "223e4567-e89b-12d3-a456-426614174000",
    "Same payment receipt failure and reproduction as canonical ticket.");
  assert.equal(result.duplicateDisposition, "duplicate");
  assert.equal(result.canonicalTicketId, "223e4567-e89b-12d3-a456-426614174000");
  assert.equal(auditEvents[0].action, "ticket.duplicate_disposition_set");
  assert.ok(calls.some(x => x.sql === "COMMIT"));
  assert.ok(!calls.some(x => x.sql === "ROLLBACK"));
});

test("distinct confirmed P1 counter excludes duplicates and non-evidence tickets", async () => {
  let query;
  const client = { async query(sql, values = []) { query = { sql, values }; return { rows: [{ count: 7 }], rowCount: 1 }; }, release() {} };
  const store = new PostgresTicketStore({ async connect() { return client; } }, async () => {});
  assert.equal(await store.countDistinctConfirmedP1("tenant-a"), 7);
  assert.match(query.sql, /severity = 'p1_confirmed'/);
  assert.match(query.sql, /duplicate_disposition = 'distinct'/);
  assert.match(query.sql, /evidence_reference IS NOT NULL/);
  assert.match(query.sql, /assigned_to IS NOT NULL/);
  assert.deepEqual(query.values, ["tenant-a"]);
  await assert.rejects(() => store.countDistinctConfirmedP1(" tenant-a"), /ticket_tenant_scope_required/);
});


test("customer conversation reads filter internal notes at the SQL boundary", async () => {
  const calls = [];
  const replyRows = [{ id: "reply-public", tenant_id: "tenant-a", application_id: "app-a", ticket_id: "ticket-1",
    author_id: "support-a", author_role: "support", body: "Customer update", visibility: "customer_visible",
    created_at: "2026-10-31T10:00:00.000Z" }];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT id FROM eper_support_tickets/.test(sql)) return { rows: [{ id: "ticket-1" }], rowCount: 1 };
      if (/SELECT \* FROM eper_support_ticket_replies/.test(sql)) return { rows: replyRows, rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }, release() {},
  };
  const store = new PostgresTicketStore({ async connect() { return client; } }, async () => {});
  const replies = await store.listReplies(identity, "ticket-1", "customer");
  assert.equal(replies.length, 1);
  const query = calls.find(x => /SELECT \* FROM eper_support_ticket_replies/.test(x.sql));
  assert.match(query.sql, /visibility = 'customer_visible'/);
  assert.deepEqual(query.values, ["tenant-a", "ticket-1"]);
});

test("customers cannot create internal support notes", async () => {
  let connections = 0;
  const store = new PostgresTicketStore({ async connect() { connections++; throw new Error("must not connect"); } }, async () => {});
  await assert.rejects(() => store.addReply(identity, "ticket-1", "Attempted internal note", "customer", "internal"),
    /customer_internal_note_forbidden/);
  assert.equal(connections, 0);
});
