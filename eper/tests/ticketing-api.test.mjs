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
  const previousModules = process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
  // Existing route tests explicitly enable ticketing for each mapped test tenant.
  if (previousModules === undefined) {
    let identities = {};
    try { identities = JSON.parse(process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON ?? "{}"); } catch {}
    const modules = {};
    for (const identity of Object.values(identities)) {
      if (identity && typeof identity.tenantId === "string") modules[identity.tenantId] = ["tickets-feedback"];
    }
    process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify(modules);
  }
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
    if (previousModules === undefined) delete process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
    else process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = previousModules;
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
    async create(identity, input, idempotencyKey) { captured = { identity, input, idempotencyKey }; return ticket; },
    async list(identity, filter) { captured = { identity, filter }; return [ticket]; },
  };
  await withServer({ ticketStore }, async (base) => {
    const bad = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST", headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "feedback", title: "UI", description: "Issue", businessImpact: "Impact", tenantId: "tenant-b" }),
    });
    assert.equal(bad.status, 400);
    const created = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST", headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", "idempotency-key": "ticket-submit-key-001", "x-tenant-id": "tenant-b", "x-actor-id": "actor-b", "x-role-key": "super-admin" },
      body: JSON.stringify({ type: "feedback", title: " UI ", description: " Issue ", businessImpact: " Impact " }),
    });
    assert.equal(created.status, 201);
    assert.equal(captured.identity.tenantId, "tenant-a");
    assert.equal(captured.identity.actorId, "actor-a");
    assert.equal(captured.identity.applicationId, "app-a");
    assert.equal(captured.input.title, "UI");
    assert.equal(captured.idempotencyKey, "ticket-submit-key-001");
    const listed = await fetch(base + "/customer/applications/app-a/tickets?limit=10&tenantId=tenant-b&applicationId=app-b", {
      headers: { authorization: `Bearer ${credential}`, "x-tenant-id": "tenant-b", "x-actor-id": "actor-b", "x-role-key": "super-admin" },
    });
    assert.equal(listed.status, 200);
    assert.equal(captured.identity.tenantId, "tenant-a");
    assert.equal(captured.filter.applicationId, "app-a");
  });
});


test("ticket creation returns a stable conflict when an idempotency key is reused with a different payload", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  const ticketStore = {
    async assertReady() {},
    async create(_identity, _input, key) {
      assert.equal(key, "ticket-reuse-key-001");
      throw new Error("IDEMPOTENCY_KEY_CONFLICT");
    },
    async list() { return []; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", "idempotency-key": "ticket-reuse-key-001", accept: "application/vnd.eper.v1+json" },
      body: JSON.stringify({ type: "feedback", title: "UI", description: "Issue", businessImpact: "Impact" }),
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "IDEMPOTENCY_KEY_CONFLICT");
    assert.ok(payload.meta.requestId);
    assert.equal(response.headers.get("x-request-id"), payload.meta.requestId);
  });
});

test("ticket creation rejects malformed idempotency keys", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  let called = false;
  const ticketStore = { async assertReady() {}, async create() { called = true; }, async list() { return []; } };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", "idempotency-key": "bad key" },
      body: JSON.stringify({ type: "feedback", title: "UI", description: "Issue", businessImpact: "Impact" }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
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
    const queue = await fetch(base + "/admin/support/tickets?tenantId=tenant-attacker&applicationId=app-a&status=triaged&type=feedback&severity=p3&limit=25&offset=50", {
      headers: { authorization: `Bearer ${credential}`, "x-correlation-id": "ticket-admin-test-1", "x-tenant-id": "tenant-attacker", "x-actor-id": "attacker-actor", "x-role-key": "super_admin", accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(queue.status, 200);
    const queueBody = await queue.json();
    assert.equal(queueBody.success, true);
    assert.equal(queueBody.data.tenantId, "tenant-support-a");
    assert.ok(queueBody.meta.requestId);
    assert.equal(queue.headers.get("x-request-id"), queueBody.meta.requestId);
    assert.equal(calls[0].identity.tenantId, "tenant-support-a");
    assert.deepEqual(calls[0].filter, {
      status: "triaged",
      severity: "p3",
      type: "feedback",
      applicationId: "app-a",
      limit: 25,
      offset: 50,
    }, "authorized filters and pagination must reach the store while caller tenant overrides are ignored");

    const update = await fetch(base + "/admin/support/tickets/00000000-0000-4000-8000-000000000001/status", {
      method: "PATCH",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", "x-correlation-id": "ticket-admin-test-2", "x-tenant-id": "tenant-attacker", "x-actor-id": "attacker-actor", "x-role-key": "customer" },
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


test("support admin triage console is feature-gated and calls protected tenant-scoped APIs", async () => {
  delete process.env.EPER_TICKETING_API_ENABLED;
  await withServer({}, async (base) => {
    const disabled = await fetch(base + "/admin/support/tickets-ui");
    assert.equal(disabled.status, 404);
  });
  process.env.EPER_TICKETING_API_ENABLED = "true";
  await withServer({}, async (base) => {
    const response = await fetch(base + "/admin/support/tickets-ui");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'self'/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    for (const marker of [
      "Client-Submitted Ticket Queue", "Support admin bearer credential", "all client-submitted tickets within your authorized tenant", "Customer users see only tickets for the application they select", "/admin/support/tickets?",
      "filterStatus", "filterType", "filterSeverity", "Update status", "Save assignment",
      "authenticated tenant", "NOT CONNECTED", "queueLoadSequence", "requestToken!==token", "CONNECTING", "Could not load the authorized queue",
      "previousPage", "nextPage", "queueOffset", "limit:\"100\"", "aria-label=\"Ticket queue pagination\"",
    ]) assert.ok(html.includes(marker), "missing support triage contract: " + marker);
    assert.match(html, /const endpoint="\/admin\/support\/tickets\/"/, "lifecycle mutations must use the protected admin ticket route");
    assert.match(html, /authorization:"Bearer "\+token/, "admin API requests must use the entered in-memory credential");
    assert.match(html, /cache:"no-store"/, "ticket data must not be cached");
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
      headers: { authorization: `Bearer ${credential}`, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(queue.status, 403);
    const queuePayload = await queue.json();
    assert.equal(queuePayload.success, false);
    assert.equal(queuePayload.error.code, "TICKET_ADMIN_PERMISSION_REQUIRED");
    assert.ok(queuePayload.meta.requestId);
    const mutation = await fetch(base + "/admin/support/tickets/00000000-0000-4000-8000-000000000001/status", {
      method: "PATCH",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "triaged" }),
    });
    assert.equal(mutation.status, 403);
    assert.equal(storeCalls, 0);
  });
});


test("support admin cannot mutate a ticket outside its tenant and receives non-disclosing not-found", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-admin-a", actorId: "support-a", roleKey: "support_admin" },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin", "super_admin"]);
  const calls = [];
  const ticketStore = {
    async assertReady() {},
    async changeStatus(identity, ticketId, status) {
      calls.push({ operation: "status", identity, ticketId, status });
      return null;
    },
    async assign(identity, ticketId, assignedTo) {
      calls.push({ operation: "assignment", identity, ticketId, assignedTo });
      return null;
    },
    async list() { return []; },
  };
  const ticketId = "00000000-0000-4000-8000-000000000099";
  await withServer({ ticketStore }, async (base) => {
    const headers = { authorization: `Bearer ${credential}`, "content-type": "application/json", accept: "application/vnd.eper.v1+json" };
    const status = await fetch(base + "/admin/support/tickets/" + ticketId + "/status", {
      method: "PATCH", headers, body: JSON.stringify({ status: "resolved" }),
    });
    assert.equal(status.status, 404);
    const statusPayload = await status.json();
    assert.equal(statusPayload.success, false);
    assert.equal(statusPayload.error.code, "TICKET_NOT_FOUND");
    assert.ok(statusPayload.meta.requestId);

    const assignment = await fetch(base + "/admin/support/tickets/" + ticketId + "/assignment", {
      method: "PATCH", headers, body: JSON.stringify({ assignedTo: "agent-a" }),
    });
    assert.equal(assignment.status, 404);
    const assignmentPayload = await assignment.json();
    assert.equal(assignmentPayload.success, false);
    assert.equal(assignmentPayload.error.code, "TICKET_NOT_FOUND");
    assert.ok(assignmentPayload.meta.requestId);

    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.identity.tenantId, "tenant-admin-a");
      assert.equal(call.identity.actorId, "support-a");
      assert.equal(call.ticketId, ticketId);
    }
  });
});

test("customer ticket API fails closed when Tickets & Feedback is not enabled for the tenant", async () => {
  const previous = {
    enabled: process.env.EPER_TICKETING_API_ENABLED,
    identities: process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON,
    assignments: process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON,
    modules: process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON,
  };
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  let storeCalled = false;
  const ticketStore = {
    async assertReady() {},
    async create() { storeCalled = true; throw new Error("must not be called"); },
    async list() { storeCalled = true; return []; },
  };
  try {
    await withServer({ ticketStore }, async (base) => {
      for (const modulesConfig of [undefined, "{malformed", JSON.stringify({ "tenant-a": ["help-center"] })]) {
        if (modulesConfig === undefined) delete process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
        else process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = modulesConfig;
        const response = await fetch(base + "/customer/applications/app-a/tickets", {
          headers: { authorization: `Bearer ${credential}` },
        });
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { error: "customer_ticketing_not_enabled" });
      }
      assert.equal(storeCalled, false);
    });
  } finally {
    if (previous.enabled === undefined) delete process.env.EPER_TICKETING_API_ENABLED; else process.env.EPER_TICKETING_API_ENABLED = previous.enabled;
    if (previous.identities === undefined) delete process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON; else process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = previous.identities;
    if (previous.assignments === undefined) delete process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON; else process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = previous.assignments;
    if (previous.modules === undefined) delete process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON; else process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = previous.modules;
  }
});

test("ticket admin APIs fail closed when the admin role allowlist is missing or malformed", async () => {
  const previous = {
    enabled: process.env.EPER_TICKETING_API_ENABLED,
    identities: process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON,
    roles: process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON,
  };
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "support_admin" },
  });
  let storeCalls = 0;
  const ticketStore = {
    async assertReady() {},
    async list() { storeCalls++; return []; },
    async changeStatus() { storeCalls++; throw new Error("must not be called"); },
    async assign() { storeCalls++; throw new Error("must not be called"); },
  };
  try {
    await withServer({ ticketStore }, async (base) => {
      for (const roles of [undefined, "{malformed", "[]", JSON.stringify([" "]), JSON.stringify(["customer"])]) {
        if (roles === undefined) delete process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON;
        else process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = roles;
        const response = await fetch(base + "/admin/support/tickets", {
          headers: { authorization: `Bearer ${credential}` },
        });
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), { error: "ticket_admin_permission_required" });
      }
      assert.equal(storeCalls, 0);
    });
  } finally {
    if (previous.enabled === undefined) delete process.env.EPER_TICKETING_API_ENABLED; else process.env.EPER_TICKETING_API_ENABLED = previous.enabled;
    if (previous.identities === undefined) delete process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON; else process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = previous.identities;
    if (previous.roles === undefined) delete process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON; else process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = previous.roles;
  }
});
