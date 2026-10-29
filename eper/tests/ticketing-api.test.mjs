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
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      headers: { accept: "application/vnd.eper.v1+json", "x-correlation-id": "ticket-disabled-1" },
    });
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "NOT_FOUND");
    assert.equal(payload.meta.requestId, "ticket-disabled-1");
    assert.equal(response.headers.get("x-request-id"), "ticket-disabled-1");

    const invalidCorrelation = await fetch(base + "/customer/applications/app-a/tickets", {
      headers: { accept: "application/vnd.eper.v1+json", "x-correlation-id": "invalid correlation id with spaces" },
    });
    assert.equal(invalidCorrelation.status, 404);
    const invalidPayload = await invalidCorrelation.json();
    assert.match(invalidPayload.meta.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(invalidCorrelation.headers.get("x-request-id"), invalidPayload.meta.requestId);
    assert.notEqual(invalidPayload.meta.requestId, "invalid correlation id with spaces");

    const legacyPreference = await fetch(base + "/customer/applications/app-a/tickets", {
      headers: { accept: "application/vnd.eper.v1+json; q=0" },
    });
    assert.equal(legacyPreference.status, 404);
    const legacyPayload = await legacyPreference.json();
    assert.equal(legacyPayload.error, "not_found");
    assert.equal(Object.hasOwn(legacyPayload, "success"), false, "q=0 must not opt into the versioned envelope");
  });
});

test("ticket API rejects untrusted identity and cross-tenant application assignment", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
    [otherCredential]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer", applicationIds: ["app-b"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"], "tenant-b": ["app-b"] });
  const ticketStore = { async assertReady() {}, async list() { return []; }, async create() { throw new Error("must not be called"); } };
  await withServer({ ticketStore }, async (base) => {
    const noAuth = await fetch(base + "/customer/applications/app-a/tickets", {
      headers: { accept: "application/vnd.eper.v1+json", "x-correlation-id": "ticket-auth-missing-1" },
    });
    assert.equal(noAuth.status, 401);
    const noAuthBody = await noAuth.json();
    assert.equal(noAuthBody.success, false);
    assert.equal(noAuthBody.error.code, "UNAUTHORIZED");
    assert.equal(noAuthBody.meta.requestId, "ticket-auth-missing-1");
    assert.equal(noAuth.headers.get("cache-control"), "no-store");
    const wrongApp = await fetch(base + "/customer/applications/app-a/tickets", {
      headers: {
        authorization: `Bearer ${otherCredential}`,
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "ticket-auth-scope-1",
      },
    });
    assert.equal(wrongApp.status, 403);
    const wrongAppBody = await wrongApp.json();
    assert.equal(wrongAppBody.success, false);
    assert.equal(wrongAppBody.error.code, "APPLICATION_NOT_ASSIGNED_TO_TENANT");
    assert.equal(wrongAppBody.meta.requestId, "ticket-auth-scope-1");
    assert.equal(wrongApp.headers.get("x-content-type-options"), "nosniff");
  });
});

test("ticket API denies an application assigned to the tenant but not to the actor", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-b"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a", "app-b"] });
  let storeCalled = false;
  const ticketStore = {
    async assertReady() {},
    async list() { storeCalled = true; return []; },
    async create() { storeCalled = true; throw new Error("must not be called"); },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      headers: { authorization: `Bearer ${credential}`, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "ACTOR_NOT_ASSIGNED_TO_APPLICATION");
    assert.equal(storeCalled, false);
  });
});

test("ticket API fails closed for missing, empty, or malformed actor application allowlists", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  let storeCalls = 0;
  const ticketStore = {
    async assertReady() {},
    async list() { storeCalls++; return []; },
    async create() { storeCalls++; throw new Error("must not be called"); },
  };
  const invalidIdentities = [
    { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
    { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: [] },
    { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a", 7] },
    { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app/a"] },
  ];
  await withServer({ ticketStore }, async (base) => {
    for (const identity of invalidIdentities) {
      process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({ [credential]: identity });
      const response = await fetch(base + "/customer/applications/app-a/tickets", {
        headers: { authorization: `Bearer ${credential}`, accept: "application/vnd.eper.v1+json" },
      });
      assert.equal(response.status, 403);
      const payload = await response.json();
      assert.equal(payload.success, false);
      assert.equal(payload.error.code, "ACTOR_NOT_ASSIGNED_TO_APPLICATION");
    }
    assert.equal(storeCalls, 0, "invalid or missing actor allowlists must never reach persistence");
  });
});

test("ticket API derives tenant and actor from trusted identity and validates customer input", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
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
      method: "POST", headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", "idempotency-key": "ticket-submit-key-001", "x-tenant-id": "tenant-b", "x-actor-id": "actor-b", "x-role-key": "super-admin", "x-correlation-id": "invalid correlation id" },
      body: JSON.stringify({ type: "feedback", title: " UI ", description: " Issue ", businessImpact: " Impact " }),
    });
    assert.equal(created.status, 201);
    assert.match(created.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
    assert.equal(captured.identity.correlationId, created.headers.get("x-request-id"), "durable ticket audit correlation must match the response request ID even when caller correlation input is invalid");
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


test("actor application authorization blocks ticket listing, history, and replies before store access", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-b"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a", "app-b"] });
  let storeCalls = 0;
  const ticketStore = {
    async assertReady() {},
    async list() { storeCalls++; return []; },
    async create() { storeCalls++; throw new Error("must not be called"); },
    async listReplies() { storeCalls++; return []; },
    async addReply() { storeCalls++; throw new Error("must not be called"); },
  };
  const ticketId = "00000000-0000-4000-8000-000000000099";
  await withServer({ ticketStore }, async (base) => {
    const headers = {
      authorization: `Bearer ${credential}`,
      accept: "application/vnd.eper.v1+json",
      "content-type": "application/json",
    };
    const requests = [
      fetch(base + "/customer/applications/app-a/tickets", { headers }),
      fetch(base + "/customer/applications/app-a/tickets", {
        method: "POST", headers, body: JSON.stringify({
          type: "feedback", title: "Unauthorized", description: "Should be denied", businessImpact: "Authorization test",
        }),
      }),
      fetch(base + "/customer/applications/app-a/tickets/" + ticketId + "/replies", { headers }),
      fetch(base + "/customer/applications/app-a/tickets/" + ticketId + "/replies", {
        method: "POST", headers, body: JSON.stringify({ body: "unauthorized reply" }),
      }),
    ];
    for (const response of await Promise.all(requests)) {
      assert.equal(response.status, 403);
      const payload = await response.json();
      assert.equal(payload.success, false);
      assert.equal(payload.error.code, "ACTOR_NOT_ASSIGNED_TO_APPLICATION");
    }
    assert.equal(storeCalls, 0, "unauthorized requests must not reach ticket list/history/reply storage");
  });
});

test("ticket creation returns a stable conflict when an idempotency key is reused with a different payload", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
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
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
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

test("malformed admin ticket lifecycle JSON returns a safe client error without mutation", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  let mutationCalled = false;
  const ticketStore = {
    async assertReady() {},
    async list() { return []; },
    async changeStatus() { mutationCalled = true; },
    async assign() { mutationCalled = true; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets/00000000-0000-4000-8000-000000000001/status", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "admin-malformed-json-1",
      },
      body: '{"status":',
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "INVALID_JSON");
    assert.equal(payload.meta.requestId, "admin-malformed-json-1");
    assert.equal(response.headers.get("x-request-id"), "admin-malformed-json-1");
    assert.equal(mutationCalled, false);
  });
});

test("oversized admin ticket lifecycle JSON is rejected before mutation", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  let mutationCalled = false;
  const ticketStore = {
    async assertReady() {},
    async list() { return []; },
    async changeStatus() { mutationCalled = true; },
    async assign() { mutationCalled = true; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets/00000000-0000-4000-8000-000000000001/status", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "admin-oversized-json-1",
      },
      body: JSON.stringify({ status: "triaged", extra: "x".repeat(1024 * 1024) }),
    });
    assert.equal(response.status, 413);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "REQUEST_BODY_TOO_LARGE");
    assert.equal(payload.meta.requestId, "admin-oversized-json-1");
    assert.equal(response.headers.get("x-request-id"), "admin-oversized-json-1");
    assert.equal(mutationCalled, false);
  });
});

test("support admin queue and status updates remain scoped to the trusted admin tenant", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
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
    assert.equal(queueBody.data.hasMore, false);
    assert.ok(queueBody.meta.requestId);
    assert.equal(queue.headers.get("x-request-id"), queueBody.meta.requestId);
    assert.equal(calls[0].identity.tenantId, "tenant-support-a");
    assert.deepEqual(calls[0].filter, {
      status: "triaged",
      severity: "p3",
      type: "feedback",
      applicationId: "app-a",
      limit: 26,
      offset: 50,
    }, "the API must request one lookahead row to calculate hasMore");

    const update = await fetch(base + "/admin/support/tickets/00000000-0000-4000-8000-000000000001/status", {
      method: "PATCH",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", "x-correlation-id": "invalid correlation id", "x-tenant-id": "tenant-attacker", "x-actor-id": "attacker-actor", "x-role-key": "customer" },
      body: JSON.stringify({ status: "in_progress" }),
    });
    assert.equal(update.status, 200);
    const updatePayload = await update.json();
    assert.match(update.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
    assert.equal(updatePayload.meta.requestId, update.headers.get("x-request-id"));
    assert.equal(calls[1].identity.tenantId, "tenant-support-a");
    assert.equal(calls[1].identity.actorId, "support-actor-a");
    assert.equal(calls[1].identity.correlationId, update.headers.get("x-request-id"), "admin audit correlation must match the canonical response request ID");
    assert.equal(calls[1].ticketId, ticket.id);
    assert.equal(calls[1].status, "in_progress");
  });
});


test("support admin queue rejects invalid filters and pagination before querying the store", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  let storeCalls = 0;
  const ticketStore = {
    async assertReady() {},
    async list() { storeCalls++; return []; },
  };
  await withServer({ ticketStore }, async (base) => {
    for (const query of [
      "limit=101&offset=0",
      "limit=10&offset=-1",
      "status=not-a-status&limit=10&offset=0",
      "applicationId=bad%20application&limit=10&offset=0",
    ]) {
      const response = await fetch(base + "/admin/support/tickets?" + query, {
        headers: { authorization: `Bearer ${credential}` },
      });
      assert.equal(response.status, 400, query);
    }
    assert.equal(storeCalls, 0, "invalid queue requests must not query ticket storage");
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




test("customer ticket list uses the versioned success envelope and preserves pagination metadata", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  const ticket = {
    id: "ticket-1", tenantId: "tenant-a", applicationId: "app-a", createdBy: "actor-a",
    type: "feedback", title: "UI issue", description: "A description",
    businessImpact: "Impact", status: "new", severity: "p3", assignedTo: null,
    createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
  };
  let receivedFilter;
  const ticketStore = {
    async assertReady() {},
    async list(_identity, filter) { receivedFilter = filter; return [ticket]; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets?limit=10&offset=20", {
      headers: {
        authorization: `Bearer ${credential}`,
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "customer-ticket-list-success-1",
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "customer-ticket-list-success-1");
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.deepEqual(payload.data.tickets, [ticket]);
    assert.equal(payload.data.limit, 10);
    assert.equal(payload.data.offset, 20);
    assert.equal(payload.meta.requestId, "customer-ticket-list-success-1");
    assert.equal(receivedFilter.applicationId, "app-a");
    assert.equal(receivedFilter.limit, 10);
    assert.equal(receivedFilter.offset, 20);
  });
});


test("customer ticket validation errors use the versioned envelope and secure response headers", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  let storeCalled = false;
  const ticketStore = {
    async assertReady() {},
    async create() { storeCalled = true; },
    async list() { return []; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "customer-validation-error-1",
      },
      body: JSON.stringify({ type: "unknown", title: "", description: "", businessImpact: "" }),
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-request-id"), "customer-validation-error-1");
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "INVALID_TICKET_INPUT");
    assert.equal(payload.meta.requestId, "customer-validation-error-1");
    assert.equal(storeCalled, false, "invalid ticket payload must be rejected before persistence");
  });
});


test("malformed customer ticket JSON returns a safe versioned error without persistence", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  let storeCalled = false;
  const ticketStore = {
    async assertReady() {},
    async create() { storeCalled = true; },
    async list() { return []; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "customer-malformed-json-1",
      },
      body: '{"type":',
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "INVALID_JSON");
    assert.equal(payload.meta.requestId, "customer-malformed-json-1");
    assert.equal(response.headers.get("x-request-id"), "customer-malformed-json-1");
    assert.equal(JSON.stringify(payload).includes('{"type":'), false);
    assert.equal(storeCalled, false);
  });
});

test("oversized customer ticket JSON is rejected with the standardized 413 envelope", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  let storeCalled = false;
  const ticketStore = {
    async assertReady() {},
    async create() { storeCalled = true; },
    async list() { return []; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "customer-oversized-json-1",
      },
      body: JSON.stringify({ description: "x".repeat(1024 * 1024) }),
    });
    assert.equal(response.status, 413);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "REQUEST_BODY_TOO_LARGE");
    assert.equal(payload.meta.requestId, "customer-oversized-json-1");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(storeCalled, false);
  });
});

test("customer ticket creation storage failures use the standardized safe error envelope", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  const ticketStore = {
    async assertReady() {},
    async create() { throw new Error("private ticket database exception"); },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        accept: "application/vnd.eper.v1+json",
        "content-type": "application/json",
        "idempotency-key": "ticket-storage-failure-001",
        "x-correlation-id": "customer-ticket-create-failure-1",
      },
      body: JSON.stringify({
        type: "feedback",
        title: "Unable to submit",
        description: "The ticket submission failed.",
        businessImpact: "Need a safe error response.",
      }),
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-request-id"), "customer-ticket-create-failure-1");
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "TICKET_OPERATION_UNAVAILABLE");
    assert.equal(payload.error.message, "The service could not complete the request.");
    assert.equal(payload.meta.requestId, "customer-ticket-create-failure-1");
    assert.equal(JSON.stringify(payload).includes("private ticket database exception"), false);
  });
});

test("customer ticket-list storage failures return a stable non-disclosing API envelope", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  const ticketStore = {
    async assertReady() {},
    async list() { throw new Error("postgres://secret-user:secret-password@private-db/internal"); },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/customer/applications/app-a/tickets", {
      headers: {
        authorization: `Bearer ${credential}`,
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "customer-ticket-list-failure-1",
      },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-request-id"), "customer-ticket-list-failure-1");
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "TICKET_OPERATION_UNAVAILABLE");
    assert.equal(payload.error.message, "The service could not complete the request.");
    assert.equal(payload.meta.requestId, "customer-ticket-list-failure-1");
    assert.equal(JSON.stringify(payload).includes("secret-password"), false);
    assert.equal(JSON.stringify(payload).includes("private-db"), false);
  });
});



test("support admin queue returns the versioned success envelope with trusted tenant metadata", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin", "super_admin"]);
  const ticket = {
    id: "00000000-0000-4000-8000-000000000002", tenantId: "tenant-support-a",
    applicationId: "app-a", createdBy: "actor-a", type: "feedback", title: "UI",
    description: "Issue", businessImpact: "Impact", status: "triaged", severity: "p3",
    assignedTo: null, createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
  };
  let receivedIdentity;
  let receivedFilter;
  const ticketStore = {
    async assertReady() {},
    async list(identity, filter) { receivedIdentity = identity; receivedFilter = filter; return [ticket]; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets?limit=10&offset=30", {
      headers: {
        authorization: `Bearer ${credential}`,
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "admin-ticket-list-success-1",
        "x-tenant-id": "tenant-attacker",
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "admin-ticket-list-success-1");
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.deepEqual(payload.data.tickets, [ticket]);
    assert.equal(payload.data.tenantId, "tenant-support-a");
    assert.equal(payload.data.limit, 10);
    assert.equal(payload.data.offset, 30);
    assert.equal(payload.data.hasMore, false);
    assert.equal(payload.meta.requestId, "admin-ticket-list-success-1");
    assert.equal(receivedIdentity.tenantId, "tenant-support-a");
    assert.equal(receivedFilter.limit, 11);
    assert.equal(receivedFilter.offset, 30);
  });
});

test("support admin queue storage failures use the same safe response contract", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  const ticketStore = {
    async assertReady() {},
    async list() { throw new Error("sensitive database driver details"); },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets?limit=25&offset=0", {
      headers: {
        authorization: `Bearer ${credential}`,
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "admin-ticket-list-failure-1",
      },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-request-id"), "admin-ticket-list-failure-1");
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "TICKET_OPERATION_UNAVAILABLE");
    assert.equal(payload.meta.requestId, "admin-ticket-list-failure-1");
    assert.equal(JSON.stringify(payload).includes("sensitive database driver details"), false);
  });
});



test("support admin lifecycle storage failures use the standardized safe error envelope", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  const ticketStore = {
    async assertReady() {},
    async list() { return []; },
    async changeStatus() { throw new Error("private status database exception"); },
    async assign() { throw new Error("private assignment database exception"); },
  };
  const ticketId = "00000000-0000-4000-8000-000000000001";
  await withServer({ ticketStore }, async (base) => {
    const requests = [
      { path: `/admin/support/tickets/${ticketId}/status`, body: { status: "resolved" }, requestId: "ticket-status-failure-1" },
      { path: `/admin/support/tickets/${ticketId}/assignment`, body: { assignedTo: "support-agent" }, requestId: "ticket-assignment-failure-1" },
    ];
    for (const item of requests) {
      const response = await fetch(base + item.path, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${credential}`,
          accept: "application/vnd.eper.v1+json",
          "content-type": "application/json",
          "x-correlation-id": item.requestId,
        },
        body: JSON.stringify(item.body),
      });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("x-request-id"), item.requestId);
      const payload = await response.json();
      assert.equal(payload.success, false);
      assert.equal(payload.error.code, "TICKET_OPERATION_UNAVAILABLE");
      assert.equal(payload.error.message, "The service could not complete the request.");
      assert.equal(payload.meta.requestId, item.requestId);
      assert.equal(JSON.stringify(payload).includes("private status database exception"), false);
      assert.equal(JSON.stringify(payload).includes("private assignment database exception"), false);
    }
  });
});

test("support admin lifecycle mutations reject malformed and over-posted payloads before storage", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  let mutationCalls = 0;
  const ticketStore = {
    async assertReady() {},
    async list() { return []; },
    async changeStatus() { mutationCalls++; return null; },
    async assign() { mutationCalls++; return null; },
  };
  const ticketId = "00000000-0000-4000-8000-000000000001";
  await withServer({ ticketStore }, async (base) => {
    const invalidRequests = [
      { path: `/admin/support/tickets/${ticketId}/status`, body: { status: "unknown" } },
      { path: `/admin/support/tickets/${ticketId}/status`, body: { status: "resolved", tenantId: "tenant-attacker" } },
      { path: `/admin/support/tickets/${ticketId}/assignment`, body: { assignedTo: "bad assignee" } },
      { path: `/admin/support/tickets/${ticketId}/assignment`, body: { assignedTo: "support-agent", actorId: "attacker" } },
    ];
    for (const item of invalidRequests) {
      const response = await fetch(base + item.path, {
        method: "PATCH",
        headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
        body: JSON.stringify(item.body),
      });
      assert.equal(response.status, 400, JSON.stringify(item.body));
    }
    assert.equal(mutationCalls, 0, "invalid or over-posted lifecycle payloads must never reach persistence");
  });
});


test("support admin queue trims its lookahead row and reports hasMore accurately", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  let receivedFilter;
  const rows = Array.from({ length: 3 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    tenantId: "tenant-support-a", applicationId: "app-a", createdBy: "actor-a",
    type: "feedback", title: `Ticket ${index + 1}`, description: "Description",
    businessImpact: "Impact", status: "new", severity: "p3", assignedTo: null,
    createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
  }));
  const ticketStore = {
    async assertReady() {},
    async list(_identity, filter) { receivedFilter = filter; return rows.slice(0, filter.limit); },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets?limit=2&offset=0&search=%20payment%20timeout%20", {
      headers: { authorization: `Bearer ${credential}`, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(receivedFilter.limit, 3);
    assert.equal(receivedFilter.search, "payment timeout");
    assert.equal(payload.data.tickets.length, 2);
    assert.equal(payload.data.hasMore, true);
    assert.equal(payload.data.limit, 2);
  });
});


test("support admin queue rejects search terms longer than the documented bound", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  let listCalled = false;
  const ticketStore = { async assertReady() {}, async list() { listCalled = true; return []; } };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets?search=" + "x".repeat(201), {
      headers: { authorization: `Bearer ${credential}` },
    });
    assert.equal(response.status, 400);
    assert.equal(listCalled, false);
  });
});

test("support admin maximum page size uses one bounded lookahead row", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  let receivedFilter;
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    tenantId: "tenant-support-a", applicationId: "app-a", createdBy: "actor-a",
    type: "feedback", title: `Ticket ${index + 1}`, description: "Description",
    businessImpact: "Impact", status: "new", severity: "p3", assignedTo: null,
    createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
  }));
  const ticketStore = {
    async assertReady() {},
    async list(_identity, filter) { receivedFilter = filter; return rows.slice(0, filter.limit); },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets?limit=100&offset=0", {
      headers: { authorization: `Bearer ${credential}`, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(receivedFilter.limit, 101);
    assert.equal(payload.data.tickets.length, 100);
    assert.equal(payload.data.hasMore, true);
    assert.equal(payload.data.limit, 100);
  });
});


test("support admin full page without an extra row reports hasMore false", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  let receivedFilter;
  const rows = Array.from({ length: 100 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    tenantId: "tenant-support-a", applicationId: "app-a", createdBy: "actor-a",
    type: "feedback", title: `Ticket ${index + 1}`, description: "Description",
    businessImpact: "Impact", status: "new", severity: "p3", assignedTo: null,
    createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
  }));
  const ticketStore = {
    async assertReady() {},
    async list(_identity, filter) { receivedFilter = filter; return rows.slice(0, filter.limit); },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets?limit=100&offset=0", {
      headers: { authorization: `Bearer ${credential}`, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(receivedFilter.limit, 101);
    assert.equal(payload.data.tickets.length, 100);
    assert.equal(payload.data.hasMore, false);
    assert.equal(payload.data.limit, 100);
  });
});

test.after(restoreEnv);


test("ticket admin endpoints reject customer roles before calling the store", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
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
    [credential]: { tenantId: "tenant-admin-a", actorId: "support-a", roleKey: "support_admin", applicationIds: ["app-a"] },
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
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer", applicationIds: ["app-a"] },
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
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
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


test("support admin can read and post ticket replies through the tenant-scoped API", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-support-a", actorId: "support-actor-a", roleKey: "support_admin", applicationIds: ["app-a"] },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  const ticketId = "00000000-0000-4000-8000-000000000001";
  const calls = [];
  const reply = {
    id: "00000000-0000-4000-8000-000000000002",
    tenantId: "tenant-support-a", applicationId: "app-a", ticketId,
    authorId: "support-actor-a", authorRole: "support", body: "We are investigating",
    createdAt: "2026-10-26T10:00:00.000Z",
  };
  const ticketStore = {
    async assertReady() {},
    async list() { return []; },
    async listReplies(identity, id) { calls.push({ operation: "listReplies", identity, id }); return [reply]; },
    async addReply(identity, id, body, role) { calls.push({ operation: "addReply", identity, id, body, role }); return reply; },
  };
  await withServer({ ticketStore }, async (base) => {
    const headers = {
      authorization: `Bearer ${credential}`,
      accept: "application/vnd.eper.v1+json",
      "content-type": "application/json",
      "x-correlation-id": "ticket-reply-test-1",
    };
    const listed = await fetch(base + "/admin/support/tickets/" + ticketId + "/replies", { headers });
    assert.equal(listed.status, 200);
    const listedPayload = await listed.json();
    assert.equal(listedPayload.success, true);
    assert.deepEqual(listedPayload.data.replies, [reply]);

    const posted = await fetch(base + "/admin/support/tickets/" + ticketId + "/replies", {
      method: "POST", headers, body: JSON.stringify({ body: "We are investigating" }),
    });
    assert.equal(posted.status, 201);
    const postedPayload = await posted.json();
    assert.equal(postedPayload.success, true);
    assert.deepEqual(postedPayload.data.reply, reply);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].identity.tenantId, "tenant-support-a");
    assert.equal(calls[0].identity.applicationId, "eper");
    assert.equal(calls[1].identity.actorId, "support-actor-a");
    assert.equal(calls[1].role, "support");
    assert.equal(calls[1].body, "We are investigating");
  });
});


test("customer can read and post replies only for an assigned application's ticket", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-customer-a", actorId: "customer-actor-a", roleKey: "customer", applicationIds: ["app-a"] },
    [otherCredential]: { tenantId: "tenant-customer-b", actorId: "customer-actor-b", roleKey: "customer", applicationIds: ["app-b"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({
    "tenant-customer-a": ["app-a"],
    "tenant-customer-b": ["app-b"],
  });
  const ticketId = "00000000-0000-4000-8000-000000000011";
  const calls = [];
  const reply = {
    id: "00000000-0000-4000-8000-000000000012",
    tenantId: "tenant-customer-a", applicationId: "app-a", ticketId,
    authorId: "customer-actor-a", authorRole: "customer", body: "Still seeing the issue",
    createdAt: "2026-10-26T10:00:00.000Z",
  };
  const ticketStore = {
    async assertReady() {},
    async list() { return []; },
    async listReplies(identity, id) { calls.push({ operation: "listReplies", identity, id }); return [reply]; },
    async addReply(identity, id, body, role) { calls.push({ operation: "addReply", identity, id, body, role }); return reply; },
  };
  await withServer({ ticketStore }, async (base) => {
    const headers = {
      authorization: `Bearer ${credential}`,
      accept: "application/vnd.eper.v1+json",
      "content-type": "application/json",
      "x-correlation-id": "customer-ticket-reply-1",
    };
    const listed = await fetch(base + "/customer/applications/app-a/tickets/" + ticketId + "/replies", { headers });
    assert.equal(listed.status, 200);
    const listedPayload = await listed.json();
    assert.equal(listedPayload.success, true);
    assert.deepEqual(listedPayload.data.replies, [reply]);

    const posted = await fetch(base + "/customer/applications/app-a/tickets/" + ticketId + "/replies", {
      method: "POST", headers, body: JSON.stringify({ body: "Still seeing the issue" }),
    });
    assert.equal(posted.status, 201);
    const postedPayload = await posted.json();
    assert.equal(postedPayload.success, true);
    assert.deepEqual(postedPayload.data.reply, reply);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].identity.tenantId, "tenant-customer-a");
    assert.equal(calls[0].identity.applicationId, "app-a");
    assert.equal(calls[1].identity.actorId, "customer-actor-a");
    assert.equal(calls[1].role, "customer");
    assert.equal(calls[1].body, "Still seeing the issue");

    const otherTenant = await fetch(base + "/customer/applications/app-a/tickets/" + ticketId + "/replies", {
      headers: { ...headers, authorization: `Bearer ${otherCredential}` },
    });
    assert.equal(otherTenant.status, 403);
    assert.equal(calls.length, 2, "a tenant without the application assignment must not reach the reply store");
  });
});

test("customer ticket reply endpoint rejects empty, oversized, and over-posted bodies", async () => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-customer-a", actorId: "customer-actor-a", roleKey: "customer", applicationIds: ["app-a"] },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-customer-a": ["app-a"] });
  let storeCalls = 0;
  const ticketStore = {
    async assertReady() {},
    async list() { return []; },
    async addReply() { storeCalls++; return {}; },
    async listReplies() { storeCalls++; return []; },
  };
  const ticketId = "00000000-0000-4000-8000-000000000013";
  await withServer({ ticketStore }, async (base) => {
    const invalid = [
      { body: "   " },
      { body: "x".repeat(8001) },
      { body: "valid reply", tenantId: "tenant-attacker" },
    ];
    for (const body of invalid) {
      const response = await fetch(base + "/customer/applications/app-a/tickets/" + ticketId + "/replies", {
        method: "POST",
        headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(storeCalls, 0);
  });
});
