import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const original = {
  enabled: process.env.EPER_TICKETING_API_ENABLED,
  identities: process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON,
  assignments: process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON,
};
const credential = "a".repeat(48);
const otherCredential = "b".repeat(48);

function restoreEnv() {
  for (const [key, value] of [
    ["EPER_TICKETING_API_ENABLED", original.enabled],
    ["EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", original.identities],
    ["EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON", original.assignments],
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

test.after(restoreEnv);
