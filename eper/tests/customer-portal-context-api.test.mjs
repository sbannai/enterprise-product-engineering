import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("customer portal context requires trusted identity and returns server-mapped navigation", async () => {
  const previousEnabled = process.env.EPER_CUSTOMER_PORTAL_API_ENABLED;
  const previousIdentities = process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
  const token = "customer-portal-test-token-00000000000000000001";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-from-server", actorId: "actor-from-server", roleKey: "customer-admin" }
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/portal/context";
    const denied = await fetch(url);
    assert.equal(denied.status, 401);
    const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.tenantId, "tenant-from-server");
    assert.equal(body.actorId, "actor-from-server");
    assert.equal(body.roleKey, "customer-admin");
    assert.equal(body.status, "identity_resolved_navigation_only");
    assert.deepEqual(body.navigation.map((item) => item.key), ["home", "help-center", "growth-hub", "applications", "settings"]);
    assert.match(body.note, /must be implemented before customer UAT/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousEnabled === undefined) delete process.env.EPER_CUSTOMER_PORTAL_API_ENABLED;
    else process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = previousEnabled;
    if (previousIdentities === undefined) delete process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
    else process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = previousIdentities;
  }
});
