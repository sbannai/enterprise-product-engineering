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
  const response = await fetch(`${await startServer()}/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
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
