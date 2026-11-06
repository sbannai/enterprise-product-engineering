import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const ENV_KEYS = [
  "EPER_CAPABILITY_PERSISTENCE",
  "EPER_LOCAL_CAPABILITY_API",
  "EPER_LOCAL_CAPABILITY_TOKEN",
  "EPER_LOCAL_TENANT_ID",
  "EPER_LOCAL_PRINCIPAL_ID",
  "EPER_LOCAL_APPLICATION_ID",
  "EPER_LOCAL_ROLE_KEY",
  "EPER_CAPABILITY_ENTITLEMENTS_REQUIRED",
  "EPER_REQUIREMENT_MODULE_MAP_JSON",
];

async function withLocalApi({ moduleEntitlementService, configured = true }, run) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_CAPABILITY_PERSISTENCE: "memory",
    EPER_LOCAL_CAPABILITY_API: "true",
    EPER_LOCAL_CAPABILITY_TOKEN: "local-test-token-012345678901234567890123456789",
    EPER_LOCAL_TENANT_ID: "tenant-test",
    EPER_LOCAL_PRINCIPAL_ID: "principal-test",
    EPER_LOCAL_APPLICATION_ID: configured ? "application-test" : "",
    EPER_LOCAL_ROLE_KEY: configured ? "customer-admin" : "",
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

test("local capability route fails closed when entitlement configuration is missing", async () => {
  await withLocalApi({
    configured: false,
    moduleEntitlementService: { checkModule: async () => ({ allowed: true, reason: "allowed" }) },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/requirements/REQ-46301/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token-012345678901234567890123456789",
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: {} }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "capability_entitlement_enforcement_unconfigured");
  });
});

test("local capability route denies execution when entitlement policy denies access", async () => {
  let calls = 0;
  await withLocalApi({
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
    const response = await fetch(`${baseUrl}/internal/requirements/REQ-46301/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token-012345678901234567890123456789",
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

test("local capability route reaches execution only after an allowed entitlement decision", async () => {
  let calls = 0;
  await withLocalApi({
    moduleEntitlementService: {
      checkModule: async () => {
        calls++;
        return { allowed: true, reason: "allowed" };
      },
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/requirements/REQ-46301/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token-012345678901234567890123456789",
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: {} }),
    });
    assert.notEqual(response.status, 403);
    assert.notEqual((await response.clone().json()).error, "capability_entitlement_denied");
    assert.equal(calls, 1);
  });
});
