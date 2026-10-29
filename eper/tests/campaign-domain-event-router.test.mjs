import test from "node:test";
import assert from "node:assert/strict";
import { CampaignDomainEventRouter } from "../dist/packages/campaign-scheduler/campaign-domain-event-router.js";

function fakeAuditPool({ failInsert = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      if (failInsert && sql.includes("INSERT INTO eper_audit_events")) throw new Error("audit storage unavailable");
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

const event = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  eventType: "lead.created",
  eventId: "event-123",
  occurredAt: "2026-10-27T03:30:00.000Z",
  payload: { leadId: "lead-7" },
  correlationId: "correlation-123",
  environment: "sandbox",
};

test("domain event router enqueues first and records tenant-scoped audit evidence before acknowledgement", async () => {
  const order = [];
  const scheduler = {
    async enqueueEventExecutions(input) {
      order.push("enqueue");
      assert.equal(input.tenantId, "tenant-a");
      assert.equal(input.applicationId, "app-a");
      assert.equal(input.eventType, "lead.created");
      assert.equal(input.eventId, "event-123");
      return 2;
    },
  };
  const audit = fakeAuditPool();
  const originalConnect = audit.pool.connect;
  audit.pool.connect = async () => { order.push("audit"); return originalConnect(); };
  const router = new CampaignDomainEventRouter(scheduler, audit.pool);
  const result = await router.publish(event);
  assert.deepEqual(result, { acceptedExecutions: 2 });
  assert.deepEqual(order, ["enqueue", "audit"]);
  const insert = audit.calls.find((call) => call.sql.includes("INSERT INTO eper_audit_events"));
  assert.ok(insert);
  assert.equal(insert.values[2], "tenant-a");
  assert.equal(insert.values[3], "app-a");
  assert.equal(insert.values[8], "campaign.event.routed");
  assert.equal(insert.values[12], "event-123");
  assert.equal(insert.values[14], "correlation-123");
  assert.equal(insert.values[21], "campaign-event-route:event-123");
  assert.ok(String(insert.values[25]).includes('"acceptedExecutions":2'));
  assert.ok(audit.calls.some((call) => call.sql === "COMMIT"));
});

test("domain event router does not acknowledge when audit persistence fails", async () => {
  let enqueued = 0;
  const scheduler = { async enqueueEventExecutions() { enqueued += 1; return 1; } };
  const audit = fakeAuditPool({ failInsert: true });
  const router = new CampaignDomainEventRouter(scheduler, audit.pool);
  await assert.rejects(router.publish(event), /audit storage unavailable/);
  assert.equal(enqueued, 1);
  assert.ok(audit.calls.some((call) => call.sql === "ROLLBACK"));
  assert.ok(!audit.calls.some((call) => call.sql === "COMMIT"));
});
