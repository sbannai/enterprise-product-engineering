import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const ENV_KEYS = [
  "EPER_CAPABILITY_PERSISTENCE",
  "EPER_UAT_API_ENABLED",
  "EPER_UAT_API_TOKEN",
  "EPER_UAT_TENANT_ID",
  "EPER_UAT_PRINCIPAL_ID",
  "EPER_UAT_PUBLIC_ENDPOINT_ACK",
  "EPER_UAT_APPLICATION_ID",
  "EPER_UAT_ROLE_KEY",
  "EPER_CAPABILITY_ENTITLEMENTS_REQUIRED",
  "EPER_REQUIREMENT_MODULE_MAP_JSON",
];

async function withUatApi({ moduleEntitlementService, configured = true }, run) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_CAPABILITY_PERSISTENCE: "memory",
    EPER_UAT_API_ENABLED: "true",
    EPER_UAT_API_TOKEN: "uat-test-token-012345678901234567890123456789",
    EPER_UAT_TENANT_ID: "tenant-test",
    EPER_UAT_PRINCIPAL_ID: "principal-test",
    EPER_UAT_PUBLIC_ENDPOINT_ACK: "I_ACCEPT_PUBLIC_BEARER_UAT_RISK",
    EPER_UAT_APPLICATION_ID: configured ? "application-test" : "",
    EPER_UAT_ROLE_KEY: configured ? "customer-admin" : "",
    EPER_CAPABILITY_ENTITLEMENTS_REQUIRED: "true",
    EPER_REQUIREMENT_MODULE_MAP_JSON: configured ? JSON.stringify({ "REQ-46301": "records" }) : "{}",
  });
  const server = createAppServer({ moduleEntitlementService });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("UAT capability route fails closed when entitlement configuration is missing", async () => {
  await withUatApi({
    configured: false,
    moduleEntitlementService: { checkModule: async () => ({ allowed: true, reason: "allowed" }) },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/uat/requirements/REQ-46301/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer uat-test-token-012345678901234567890123456789",
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: {} }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "capability_entitlement_enforcement_unconfigured");
  });
});

test("UAT capability route denies execution when entitlement policy denies access", async () => {
  let calls = 0;
  await withUatApi({
    moduleEntitlementService: {
      checkModule: async (context, moduleKey) => {
        calls++;
        assert.equal(context.tenantId, "tenant-test");
        assert.equal(context.applicationId, "application-test");
        assert.equal(context.roleKey, "customer-admin");
        assert.equal(context.permissionKey, "capability.execute");
        assert.equal(moduleKey, "records");
        return { allowed: false, reason: "role_permission_denied" };
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/uat/requirements/REQ-46301/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer uat-test-token-012345678901234567890123456789",
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: {} }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "capability_entitlement_denied",
      reason: "role_permission_denied",
    });
    assert.equal(calls, 1);
  });
});

test("UAT capability route proceeds past entitlement gate only when access is allowed", async () => {
  let calls = 0;
  await withUatApi({
    moduleEntitlementService: {
      checkModule: async () => {
        calls++;
        return { allowed: true, reason: "allowed" };
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/uat/requirements/REQ-46301/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer uat-test-token-012345678901234567890123456789",
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: {} }),
    });
    assert.notEqual(response.status, 403);
    const body = await response.json();
    assert.notEqual(body.error, "capability_entitlement_denied");
    assert.equal(calls, 1);
  });
});
