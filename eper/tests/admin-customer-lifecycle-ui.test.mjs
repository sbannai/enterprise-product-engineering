import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";
import { CustomerLifecycleVersionConflictError } from "../dist/packages/identity/postgres-customer-lifecycle-store.js";

const TOKEN = "eper-product-admin-lifecycle-test-token-32-chars-minimum";
const initial = {
  tenantId: "lifecycle-tenant",
  status: "active",
  reason: "Initial account setup",
  effectiveAt: "2026-11-01T00:00:00.000Z",
  version: 1,
  updatedAt: "2026-11-01T00:00:00.000Z",
  updatedBy: "bootstrap-admin",
};

test("Product Admin customer lifecycle UI lists PostgreSQL accounts and performs versioned audited status changes", async () => {
  const keys = [
    "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE",
    "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
    "EPER_AUDIT_PERSISTENCE",
    "EPER_CUSTOMER_LIFECYCLE_API_ENABLED",
    "EPER_CUSTOMER_LIFECYCLE_API_TOKEN",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({
      [TOKEN]: { tenantId: "platform", actorId: "product-admin-1", roleKey: "product_admin" },
    }),
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_LIFECYCLE_API_ENABLED: "true",
  });
  let current = { ...initial };
  const changes = [];
  const store = {
    async list() { return [{ ...current }]; },
    async get(tenantId) { return tenantId === current.tenantId ? { ...current } : null; },
    async changeStatus(input) {
      changes.push(input);
      if (input.expectedVersion !== current.version) throw new CustomerLifecycleVersionConflictError(current.version);
      current = {
        ...current,
        status: input.status,
        reason: input.reason,
        effectiveAt: input.effectiveAt,
        version: current.version + 1,
        updatedAt: "2026-11-02T00:00:00.000Z",
        updatedBy: input.changedBy,
      };
      return { ...current };
    },
  };
  const server = createAppServer({ customerLifecycleStore: store });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

    const ui = await fetch(`${base}/admin/pricing-ui`);
    assert.equal(ui.status, 200);
    const html = await ui.text();
    assert.match(html, /Customer Account Lifecycle/);
    assert.match(html, /customerRows/);
    assert.match(html, /data-save-customer/);
    assert.match(html, /expectedVersion:record.version/);
    assert.match(html, /append-only audit ledger/);

    const unauthorized = await fetch(`${base}/admin/customers`);
    assert.equal(unauthorized.status, 401);

    const listed = await fetch(`${base}/admin/customers`, { headers });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.success, true);
    assert.ok(listedBody.meta?.requestId);
    assert.deepEqual(listedBody.data.customers.map((item) => item.tenantId), ["lifecycle-tenant"]);

    const changed = await fetch(`${base}/admin/customers/lifecycle-tenant/status`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        status: "inactive",
        reason: "Contract suspended by Product Admin",
        effectiveAt: "2026-11-02T00:00:00.000Z",
        expectedVersion: 1,
      }),
    });
    assert.equal(changed.status, 200);
    const changedBody = await changed.json();
    assert.equal(changedBody.success, true);
    assert.equal(changedBody.data.customer.status, "inactive");
    assert.equal(current.version, 2);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].changedBy, "product-admin-1");
    assert.equal(changes[0].environment, "sandbox");

    const stale = await fetch(`${base}/admin/customers/lifecycle-tenant/status`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        status: "active",
        reason: "Stale attempt",
        effectiveAt: "2026-11-02T00:00:00.000Z",
        expectedVersion: 1,
      }),
    });
    assert.equal(stale.status, 409);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
