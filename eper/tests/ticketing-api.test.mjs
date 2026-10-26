import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const original = {
  enabled: process.env.EPER_TICKETING_API_ENABLED,
  identities: process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON,
  assignments: process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON,
  adminRoles: process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON,
};
const credential = "a".repeat(48);
const otherCredential = "b".repeat(48);

function restoreEnv() {
  for (const [key, value] of [
    ["EPER_TICKETING_API_ENABLED", original.enabled],
    ["EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", original.identities],
    ["EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON", original.assignments],
    ["EPER_TICKETING_ADMIN_ROLE_KEYS_JSON", original.adminRoles],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function withServer(options, run) {
  const server = createAppServer(options);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("ticket API is disabled by default", async () => {
  delete process.env.EPER_TICKETING_API_ENABLED;
  await withServer({}, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets");
    assert.equal(response.status, 404);
  });
});

test("ticket API rejects untrusted identity and cross-tenant application assignment", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
    [otherCredential]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"], "tenant-b": ["app-b"] });
  const ticketStore = { async assertReady() {}, async list() { return []; }, async create() { throw new Error("must not be called"); } };
  await withServer({ ticketStore }, async (base) => {
    const noAuth = await fetch(base + "/customer/applications/app-a/tickets");
    assert.equal(noAuth.status, 401);
    const wrongApp = await fetch(base + "/customer/applications/app-a/tickets", { headers: { authorization: `Bearer ${otherCredential}` } });
    assert.equal(wrongApp.status, 403);
  });
});

test("ticket API derives tenant and actor from trusted identity and validates customer input", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  let captured;
  const ticket = { id: "ticket-1", tenantId: "tenant-a", applicationId: "app-a", createdBy: "actor-a", type: "feedback", title: "UI", description: "Issue", businessImpact: "Impact", status: "new", severity: "p3", assignedTo: null, createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z" };
  const ticketStore = {
    async assertReady() {},
    async create(identity, input) { captured = { identity, input }; return ticket; },
    async list(identity, filter) { captured = { identity, filter }; return [ticket]; },
  };
  await withServer({ ticketStore }, async (base) => {
    const bad = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST", headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "feedback", title: "UI", description: "Issue", businessImpact: "Impact", tenantId: "tenant-b" }),
    });
    assert.equal(bad.status, 400);
    const created = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST", headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "feedback", title: " UI ", description: " Issue ", businessImpact: " Impact " }),
    });
    assert.equal(created.status, 201);
    assert.equal(captured.identity.tenantId, "tenant-a");
    assert.equal(captured.identity.actorId, "actor-a");
    assert.equal(captured.identity.applicationId, "app-a");
    assert.equal(captured.input.title, "UI");
    const listed = await fetch(base + "/customer/applications/app-a/tickets?limit=10", {
      headers: { authorization: `Bearer ${credential}` },
    });
    assert.equal(listed.status, 200);
    assert.equal(captured.identity.tenantId, "tenant-a");
    assert.equal(captured.filter.applicationId, "app-a");
  });
});


test("support admin queue and status updates remain scoped to the trusted admin tenant", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin" },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin", "super_admin"]);
  const calls = [];
  const ticket = { id: "00000000-0000-4000-8000-000000000001", tenantId: "tenant-support-a", applicationId: "app-a", createdBy: "actor-a", type: "feedback", title: "UI", description: "Issue", businessImpact: "Impact", status: "triaged", severity: "p3", assignedTo: null, createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z" };
  const ticketStore = {
    async assertReady() {},
    async list(identity, filter) { calls.push({ operation: "list", identity, filter }); return [ticket]; },
    async changeStatus(identity, ticketId, status) { calls.push({ operation: "changeStatus", identity, ticketId, status }); return { ...ticket, status }; },
  };
  await withServer({ ticketStore }, async (base) => {
    const queue = await fetch(base + "/admin/support/tickets?tenantId=tenant-attacker&applicationId=app-a", {
      headers: { authorization: `Bearer ${credential}`, "x-correlation-id": "ticket-admin-test-1" },
    });
    assert.equal(queue.status, 200);
    const queueBody = await queue.json();
    assert.equal(queueBody.tenantId, "tenant-support-a");
    assert.equal(calls[0].identity.tenantId, "tenant-support-a");
    assert.equal(calls[0].filter.applicationId, "app-a");

    const update = await fetch(base + "/admin/support/tickets/00000000-0000-4000-8000-000000000001/status", {
      method: "PATCH",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", "x-correlation-id": "ticket-admin-test-2" },
      body: JSON.stringify({ status: "in_progress" }),
    });
    assert.equal(update.status, 200);
    assert.equal(calls[1].identity.tenantId, "tenant-support-a");
    assert.equal(calls[1].identity.actorId, "support-actor-a");
    assert.equal(calls[1].identity.correlationId, "ticket-admin-test-2");
    assert.equal(calls[1].ticketId, ticket.id);
    assert.equal(calls[1].status, "in_progress");
  });
});

test.after(restoreEnv);


test("ticket admin endpoints reject customer roles before calling the store", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin", "super_admin"]);
  let storeCalls = 0;
  const ticketStore = {
    async assertReady() {},
    async list() { storeCalls++; return []; },
    async changeStatus() { storeCalls++; throw new Error("must not be called"); },
    async assign() { storeCalls++; throw new Error("must not be called"); },
  };
  await withServer({ ticketStore }, async (base) => {
    const queue = await fetch(base + "/admin/support/tickets", {
      headers: { authorization: `Bearer ${credential}` },
    });
    assert.equal(queue.status, 403);
    assert.deepEqual(await queue.json(), { error: "ticket_admin_permission_required" });
    const mutation = await fetch(base + "/admin/support/tickets/00000000-0000-4000-8000-000000000001/status", {
      method: "PATCH",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "triaged" }),
    });
    assert.equal(mutation.status, 403);
    assert.equal(storeCalls, 0);
  });
});
