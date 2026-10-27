import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const credential = "c".repeat(48);
const previous = {
  enabled: process.env.EPER_TICKETING_API_ENABLED,
  identities: process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON,
  roles: process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON,
  crossTenantRoles: process.env.EPER_TICKETING_CROSS_TENANT_ROLE_KEYS_JSON,
};
test.before(() => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "support-1", roleKey: "support_admin" },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
  process.env.EPER_TICKETING_CROSS_TENANT_ROLE_KEYS_JSON = JSON.stringify(["product_admin"]);
});
test.after(() => {
  for (const [key, value] of [
    ["EPER_TICKETING_API_ENABLED", previous.enabled],
    ["EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", previous.identities],
    ["EPER_TICKETING_ADMIN_ROLE_KEYS_JSON", previous.roles],
    ["EPER_TICKETING_CROSS_TENANT_ROLE_KEYS_JSON", previous.crossTenantRoles],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function withServer(options, callback) {
  const server = createAppServer(options);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const auth = { authorization: `Bearer ${credential}` };
const ticket = { id: "123e4567-e89b-12d3-a456-426614174000", tenantId: "tenant-a", applicationId: "app-a", status: "triaged" };

test("admin ticket queue is tenant-scoped and uses configured support role", async () => {
  let args;
  const ticketStore = {
    async list(identity, filter) { args = { identity, filter }; return [ticket]; },
    async changeStatus() { return ticket; },
    async assign() { return ticket; },
  };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets?applicationId=app-a", { headers: auth });
    assert.equal(response.status, 200);
    assert.equal(args.identity.tenantId, "tenant-a");
    assert.equal(args.filter.applicationId, "app-a");
  });
});

test("admin ticket lifecycle endpoint validates status and invokes tenant-scoped store", async () => {
  let args;
  const ticketStore = {
    async list() { return []; },
    async changeStatus(identity, id, status) { args = { identity, id, status }; return ticket; },
    async assign() { return ticket; },
  };
  await withServer({ ticketStore }, async (base) => {
    const bad = await fetch(base + "/admin/support/tickets/123e4567-e89b-12d3-a456-426614174000/status", {
      method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ status: "admin_override" }),
    });
    assert.equal(bad.status, 400);
    const ok = await fetch(base + "/admin/support/tickets/123e4567-e89b-12d3-a456-426614174000/status", {
      method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ status: "triaged" }),
    });
    assert.equal(ok.status, 200);
    assert.equal(args.identity.tenantId, "tenant-a");
    assert.equal(args.id, ticket.id);
    assert.equal(args.status, "triaged");
  });
});

test("admin ticket queue denies roles absent from configured allowlist", async () => {
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["tenant_owner"]);
  const ticketStore = { async list() { throw new Error("must not be called"); } };
  await withServer({ ticketStore }, async (base) => {
    const response = await fetch(base + "/admin/support/tickets", { headers: auth });
    assert.equal(response.status, 403);
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
});


test("admin queue rejects invalid filters before persistence", async () => {
  let calls = 0;
  const ticketStore = { async list() { calls++; return []; }, async changeStatus() { return ticket; }, async assign() { return ticket; } };
  await withServer({ ticketStore }, async (base) => {
    for (const query of ["?status=bogus", "?severity=critical", "?type=unknown", "?applicationId=bad%20id", "?limit=101", "?offset=-1"]) {
      const response = await fetch(base + "/admin/support/tickets" + query, { headers: auth });
      assert.equal(response.status, 400, query);
      assert.deepEqual(await response.json(), { error: "invalid_ticket_filters" });
    }
    assert.equal(calls, 0);
  });
});

test("admin assignment rejects extra fields and keeps trusted tenant identity", async () => {
  let args;
  const ticketStore = { async list() { return []; }, async changeStatus() { return ticket; }, async assign(identity, id, assignedTo) { args = { identity, id, assignedTo }; return ticket; } };
  await withServer({ ticketStore }, async (base) => {
    const url = base + "/admin/support/tickets/" + ticket.id + "/assignment";
    const bad = await fetch(url, { method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ assignedTo: "support-2", tenantId: "tenant-b" }) });
    assert.equal(bad.status, 400);
    const good = await fetch(url, { method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ assignedTo: "support-2" }) });
    assert.equal(good.status, 200);
    assert.equal(args.identity.tenantId, "tenant-a");
    assert.equal(args.id, ticket.id);
    assert.equal(args.assignedTo, "support-2");
  });
});


test("same admin ticket API derives result scope from the authenticated role", async () => {
  const clientCredential = "d".repeat(48);
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "admin-1", roleKey: "product_admin" },
    [clientCredential]: { tenantId: "tenant-a", actorId: "client-1", roleKey: "support_admin" },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["product_admin", "support_admin"]);
  process.env.EPER_TICKETING_CROSS_TENANT_ROLE_KEYS_JSON = JSON.stringify(["product_admin"]);
  const calls = [];
  const ticketStore = {
    async list(scope, filter) {
      calls.push({ scope, filter });
      return scope.tenantId
        ? [ticket]
        : [ticket, { ...ticket, id: "223e4567-e89b-12d3-a456-426614174000", tenantId: "tenant-b" }];
    },
    async changeStatus() { return ticket; },
    async assign() { return ticket; },
  };
  await withServer({ ticketStore }, async (base) => {
    const product = await fetch(base + "/admin/support/tickets", { headers: auth });
    assert.equal(product.status, 200);
    const productBody = await product.json();
    assert.equal(productBody.scope, "authorized_platform");
    assert.equal("tenantId" in productBody, false);
    assert.equal(calls[0].scope.tenantId, undefined);

    const client = await fetch(base + "/admin/support/tickets", {
      headers: { authorization: "Bearer " + clientCredential },
    });
    assert.equal(client.status, 200);
    const clientBody = await client.json();
    assert.equal(clientBody.scope, "tenant");
    assert.equal(clientBody.tenantId, "tenant-a");
    assert.equal(calls[1].scope.tenantId, "tenant-a");
  });
});
