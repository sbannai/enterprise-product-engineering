import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createAppServer } from "../dist/apps/api/server.js";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function startServer() {
  const server = createAppServer();
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

test("health returns the configured commit build ID", async () => {
  const previous = process.env.EPER_BUILD_ID;
  process.env.EPER_BUILD_ID = "b654c471152dba3cde07000be26bd57028872a91";
  try {
    const response = await fetch(`${await startServer()}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "eper-api",
      buildId: "b654c471152dba3cde07000be26bd57028872a91",
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (previous === undefined) delete process.env.EPER_BUILD_ID;
    else process.env.EPER_BUILD_ID = previous;
  }
});

test("health fails closed when a commit build ID is not configured", async () => {
  const previous = process.env.EPER_BUILD_ID;
  delete process.env.EPER_BUILD_ID;
  try {
    const response = await fetch(`${await startServer()}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "unconfigured",
      service: "eper-api",
      buildId: null,
    });
  } finally {
    if (previous !== undefined) process.env.EPER_BUILD_ID = previous;
  }
});

test("unknown routes return 404 without exposing implementation details", async () => {
  const response = await fetch(`${await startServer()}/not-a-route`, { headers: { "x-correlation-id": "route-test-404" } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
  assert.equal(response.headers.get("content-type")?.toLowerCase(), "application/json; charset=utf-8");
  assert.equal(response.headers.get("x-request-id"), "route-test-404");
});

test("unknown routes negotiate standardized v1 error envelopes without changing legacy defaults", async () => {
  const base = await startServer();
  const legacy = await fetch(`${base}/missing-legacy-route`);
  assert.equal(legacy.status, 404);
  assert.deepEqual(await legacy.json(), { error: "not_found" });

  const standardized = await fetch(`${base}/missing-v1-route`, {
    headers: { accept: "application/vnd.eper.v1+json", "x-correlation-id": "v1-error-contract" },
  });
  assert.equal(standardized.status, 404);
  assert.equal(standardized.headers.get("x-request-id"), "v1-error-contract");
  assert.deepEqual(await standardized.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
    meta: { requestId: "v1-error-contract" },
  });

  const caseInsensitive = await fetch(`${base}/missing-v1-case-route`, {
    headers: { accept: "application/vnd.EPER.v1+JSON; charset=utf-8, application/json" },
  });
  assert.equal(caseInsensitive.status, 404);
  assert.deepEqual(await caseInsensitive.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
    meta: { requestId: caseInsensitive.headers.get("x-request-id") },
  });
});

test("local capability API is disabled by default", async () => {
  const previous = process.env.EPER_LOCAL_CAPABILITY_API;
  delete process.env.EPER_LOCAL_CAPABILITY_API;
  try {
    const response = await fetch(`${await startServer()}/internal/requirements/REQ-46303/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { operation: "validate", input: {} } }),
    });
    assert.equal(response.status, 404);
  } finally {
    if (previous !== undefined) process.env.EPER_LOCAL_CAPABILITY_API = previous;
  }
});

test("local capability API authenticates and routes a requirement to its concrete service", async () => {
  const keys = ["EPER_LOCAL_CAPABILITY_API", "EPER_LOCAL_CAPABILITY_TOKEN", "EPER_LOCAL_TENANT_ID", "EPER_LOCAL_PRINCIPAL_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_LOCAL_CAPABILITY_API: "true",
    EPER_LOCAL_CAPABILITY_TOKEN: "local-test-token-0123456789-0123456789",
    EPER_LOCAL_TENANT_ID: "test-tenant",
    EPER_LOCAL_PRINCIPAL_ID: "test-operator",
  });
  try {
    const base = await startServer();
    const denied = await fetch(`${base}/internal/requirements/REQ-46303/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { operation: "validate", input: { ok: true } } }),
    });
    assert.equal(denied.status, 401);

    const response = await fetch(`${base}/internal/requirements/REQ-46303/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer local-test-token-0123456789-0123456789",
      },
      body: JSON.stringify({ payload: { operation: "validate", input: { ok: true } } }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.result.requirementId, "REQ-46303");
    assert.equal(body.result.pattern, "XX03");
    assert.equal(body.result.status, "EXECUTED");
    assert.equal(body.result.data.payload.operation, "validate");
    assert.equal(body.result.data.payload.validation.valid, true);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("local capability API rejects unknown requirement IDs", async () => {
  const keys = ["EPER_LOCAL_CAPABILITY_API", "EPER_LOCAL_CAPABILITY_TOKEN", "EPER_LOCAL_TENANT_ID", "EPER_LOCAL_PRINCIPAL_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_LOCAL_CAPABILITY_API: "true",
    EPER_LOCAL_CAPABILITY_TOKEN: "local-test-token-0123456789-0123456789",
    EPER_LOCAL_TENANT_ID: "test-tenant",
    EPER_LOCAL_PRINCIPAL_ID: "test-operator",
  });
  try {
    const response = await fetch(`${await startServer()}/internal/requirements/REQ-NOT-REAL/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer local-test-token-0123456789-0123456789",
      },
      body: JSON.stringify({ payload: { operation: "validate", input: {} } }),
    });
    assert.equal(response.status, 404);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("public UAT capability API stays disabled unless explicitly acknowledged", async () => {
  const keys = ["EPER_UAT_API_ENABLED", "EPER_UAT_API_TOKEN", "EPER_UAT_TENANT_ID", "EPER_UAT_PRINCIPAL_ID", "EPER_UAT_PUBLIC_ENDPOINT_ACK"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    const response = await fetch(`${await startServer()}/uat/requirements/REQ-46303/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { operation: "validate", input: { ok: true } } }),
    });
    assert.equal(response.status, 404);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("public UAT capability API requires bearer token and explicit public-endpoint acknowledgement", async () => {
  const keys = ["EPER_UAT_API_ENABLED", "EPER_UAT_API_TOKEN", "EPER_UAT_TENANT_ID", "EPER_UAT_PRINCIPAL_ID", "EPER_UAT_PUBLIC_ENDPOINT_ACK"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_UAT_API_ENABLED: "true",
    EPER_UAT_API_TOKEN: "uat-test-token-0123456789-0123456789",
    EPER_UAT_TENANT_ID: "uat-test-tenant",
    EPER_UAT_PRINCIPAL_ID: "uat-test-operator",
    EPER_UAT_PUBLIC_ENDPOINT_ACK: "I_ACCEPT_PUBLIC_BEARER_UAT_RISK",
  });
  try {
    const base = await startServer();
    const denied = await fetch(`${base}/uat/requirements/REQ-46303/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { operation: "validate", input: { ok: true } } }),
    });
    assert.equal(denied.status, 401);

    const response = await fetch(`${base}/uat/requirements/REQ-46303/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer uat-test-token-0123456789-0123456789",
      },
      body: JSON.stringify({ payload: { operation: "validate", input: { ok: true } } }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.result.requirementId, "REQ-46303");
    assert.equal(body.result.pattern, "XX03");
    assert.equal(body.result.status, "EXECUTED");
    assert.equal(body.result.data.payload.validation.valid, true);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("public UAT capability API rejects unknown requirement IDs", async () => {
  const keys = ["EPER_UAT_API_ENABLED", "EPER_UAT_API_TOKEN", "EPER_UAT_TENANT_ID", "EPER_UAT_PRINCIPAL_ID", "EPER_UAT_PUBLIC_ENDPOINT_ACK"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_UAT_API_ENABLED: "true",
    EPER_UAT_API_TOKEN: "uat-test-token-0123456789-0123456789",
    EPER_UAT_TENANT_ID: "uat-test-tenant",
    EPER_UAT_PRINCIPAL_ID: "uat-test-operator",
    EPER_UAT_PUBLIC_ENDPOINT_ACK: "I_ACCEPT_PUBLIC_BEARER_UAT_RISK",
  });
  try {
    const response = await fetch(`${await startServer()}/uat/requirements/REQ-NOT-REAL/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer uat-test-token-0123456789-0123456789",
      },
      body: JSON.stringify({ payload: { operation: "validate", input: {} } }),
    });
    assert.equal(response.status, 404);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("admin configuration route negotiates standardized auth errors while preserving legacy clients", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_API_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "process-memory",
    EPER_ADMIN_CONFIG_API_TOKEN: "admin-auth-test-token-0123456789-0123456789",
  });
  try {
    const base = await startServer();
    const legacy = await fetch(`${base}/admin/config/roles-access`);
    assert.equal(legacy.status, 401);
    assert.deepEqual(await legacy.json(), { error: "unauthorized" });

    const standardized = await fetch(`${base}/admin/config/roles-access`, {
      headers: { accept: "application/vnd.eper.v1+json", "x-correlation-id": "admin-auth-contract" },
    });
    assert.equal(standardized.status, 401);
    assert.equal(standardized.headers.get("x-request-id"), "admin-auth-contract");
    assert.deepEqual(await standardized.json(), {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication is required." },
      meta: { requestId: "admin-auth-contract" },
    });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("admin access-check validation negotiates standardized 400 errors without changing legacy clients", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_API_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "process-memory",
    EPER_ADMIN_CONFIG_API_TOKEN: "admin-validation-test-token-0123456789-0123456789",
  });
  try {
    const base = await startServer();
    const payload = { principalId: "", permission: "not-a-supported-permission" };
    const legacy = await fetch(`${base}/admin/config/access-check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer admin-validation-test-token-0123456789-0123456789",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(legacy.status, 400);
    assert.deepEqual(await legacy.json(), { error: "principalId_and_supported_permission_required" });

    const standardized = await fetch(`${base}/admin/config/access-check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer admin-validation-test-token-0123456789-0123456789",
        accept: "application/vnd.eper.v1+json",
        "x-correlation-id": "admin-validation-contract",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(standardized.status, 400);
    assert.equal(standardized.headers.get("content-type")?.toLowerCase(), "application/json; charset=utf-8");
    assert.equal(standardized.headers.get("x-request-id"), "admin-validation-contract");
    assert.deepEqual(await standardized.json(), {
      success: false,
      error: {
        code: "PRINCIPALID_AND_SUPPORTED_PERMISSION_REQUIRED",
        message: "The request could not be completed.",
      },
      meta: { requestId: "admin-validation-contract" },
    });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("pricing validation negotiates standardized errors while preserving legacy response bodies", async () => {
  const keys = ["EPER_PRICING_API_ENABLED", "EPER_PRICING_API_TOKEN", "EPER_ADMIN_CONFIG_PERSISTENCE"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_PRICING_API_ENABLED: "true",
    EPER_PRICING_API_TOKEN: "pricing-contract-test-token-0123456789-0123456789",
    EPER_ADMIN_CONFIG_PERSISTENCE: "process-memory",
  });
  try {
    const base = await startServer();
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer pricing-contract-test-token-0123456789-0123456789",
    };
    const payload = { productId: "", marketId: 42 };
    const legacy = await fetch(`${base}/pricing/quote`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    assert.equal(legacy.status, 400);
    assert.deepEqual(await legacy.json(), {
      error: "productId and marketId are required; currency must be a string when supplied",
    });

    const standardized = await fetch(`${base}/pricing/quote`, {
      method: "POST",
      headers: { ...headers, accept: "application/vnd.eper.v1+json", "x-correlation-id": "pricing-validation-contract" },
      body: JSON.stringify(payload),
    });
    assert.equal(standardized.status, 400);
    assert.equal(standardized.headers.get("x-request-id"), "pricing-validation-contract");
    assert.deepEqual(await standardized.json(), {
      success: false,
      error: {
        code: "PRODUCTID_AND_MARKETID_ARE_REQUIRED_CURRENCY_MUST_BE_A_STRING_WH",
        message: "The request could not be completed.",
      },
      meta: { requestId: "pricing-validation-contract" },
    });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("customer ticketing disabled response supports v1 errors without changing legacy clients", async () => {
  const previous = process.env.EPER_TICKETING_API_ENABLED;
  delete process.env.EPER_TICKETING_API_ENABLED;
  try {
    const base = await startServer();
    const legacy = await fetch(`${base}/customer/applications/app-1/tickets`);
    assert.equal(legacy.status, 404);
    assert.deepEqual(await legacy.json(), { error: "not_found" });

    const standardized = await fetch(`${base}/customer/applications/app-1/tickets`, {
      headers: { accept: "application/vnd.eper.v1+json", "x-correlation-id": "ticketing-disabled-contract" },
    });
    assert.equal(standardized.status, 404);
    assert.equal(standardized.headers.get("x-request-id"), "ticketing-disabled-contract");
    assert.deepEqual(await standardized.json(), {
      success: false,
      error: { code: "NOT_FOUND", message: "The requested resource was not found." },
      meta: { requestId: "ticketing-disabled-contract" },
    });
  } finally {
    if (previous === undefined) delete process.env.EPER_TICKETING_API_ENABLED;
    else process.env.EPER_TICKETING_API_ENABLED = previous;
  }
});


test("requirements endpoint negotiates the standard v1 success envelope while preserving legacy payloads", async () => {
  const keys = ["EPER_REQUIREMENTS_API_ENABLED", "EPER_REQUIREMENTS_API_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_REQUIREMENTS_API_ENABLED: "true",
    EPER_REQUIREMENTS_API_TOKEN: "requirements-v1-test-token-0123456789-0123456789",
  });
  try {
    const base = await startServer();
    const headers = {
      authorization: "Bearer requirements-v1-test-token-0123456789-0123456789",
      "x-correlation-id": "requirements-v1-success",
    };
    const legacy = await fetch(`${base}/v1/requirements?limit=1`, { headers });
    assert.equal(legacy.status, 200);
    const legacyBody = await legacy.json();
    assert.equal(legacyBody.source, "requirement-registry");
    assert.equal(legacyBody.limit, 1);
    assert.equal(legacyBody.success, undefined);

    const standardized = await fetch(`${base}/v1/requirements?limit=1`, {
      headers: { ...headers, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(standardized.status, 200);
    assert.equal(standardized.headers.get("content-type")?.toLowerCase(), "application/json; charset=utf-8");
    assert.equal(standardized.headers.get("cache-control"), "no-store");
    assert.equal(standardized.headers.get("x-content-type-options"), "nosniff");
    assert.equal(standardized.headers.get("x-request-id"), "requirements-v1-success");
    assert.deepEqual(await standardized.json(), {
      success: true,
      data: legacyBody,
      meta: { requestId: "requirements-v1-success" },
    });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
