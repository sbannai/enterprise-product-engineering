import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const credential = "c".repeat(48);
const previous = {
  enabled: process.env.EPER_TICKETING_API_ENABLED,
  identities: process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON,
  roles: process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON,
};
test.before(() => {
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "support-1", roleKey: "support_admin" },
  });
  process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON = JSON.stringify(["support_admin"]);
});
test.after(() => {
  for (const [key, value] of [
    ["EPER_TICKETING_API_ENABLED", previous.enabled],
    ["EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", previous.identities],
    ["EPER_TICKETING_ADMIN_ROLE_KEYS_JSON", previous.roles],
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
