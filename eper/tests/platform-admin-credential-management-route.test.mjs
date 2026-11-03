import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handlePlatformAdminCredentialManagementRoute } from "../dist/apps/api/platform-admin-credential-management-route.js";

const originalEnabled = process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED;
const issuer = {
  credentialId: "issuer-credential-01",
  platformActorId: "root-operator",
  permissions: ["platform_admin:credentials:manage", "provider_catalogue:manage"],
};

function request(path, body, authorization = "Bearer durable-test-token-0000000000000000", method = "POST") {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  stream.method = method;
  stream.headers = { authorization, "x-correlation-id": "credential-route-test" };
  return stream;
}

function response() {
  return {
    statusCode: 0, headers: {}, body: "",
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(value) { this.body = value; },
  };
}

function dependencies(overrides = {}) {
  const calls = [];
  const store = {
    async resolve(token) { calls.push(["resolve", token]); return overrides.principal === undefined ? issuer : overrides.principal; },
    async issue(input) {
      calls.push(["issue", input]);
      return { credentialId: input.credentialId, platformActorId: input.platformActorId,
        permissions: input.permissions, expiresAt: input.expiresAt, bearerToken: "one-time-secret" };
    },
    async revoke(input) { calls.push(["revoke", input]); return true; },
  };
  return { calls, store, environment: "sandbox", serviceVersion: "test-build" };
}

test("credential issue requires durable issuer and returns the bearer token once", async () => {
  process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED = "true";
  const deps = dependencies(), res = response();
  const handled = await handlePlatformAdminCredentialManagementRoute(
    request("/platform/credentials", {
      platformActorId: "catalogue-operator",
      permissions: ["provider_catalogue:manage"],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }), res, "/platform/credentials", deps,
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).result.bearerToken, "one-time-secret");
  const issued = deps.calls.find(([kind]) => kind === "issue")[1];
  assert.equal(issued.actorId, "root-operator");
  assert.deepEqual(issued.permissions, ["provider_catalogue:manage"]);
  assert.equal(issued.environment, "sandbox");
});

test("credential issue rejects privilege escalation through issuer grant ceiling", async () => {
  process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED = "true";
  const deps = dependencies({
    principal: { ...issuer, permissions: ["platform_admin:credentials:manage"] },
  }), res = response();
  await handlePlatformAdminCredentialManagementRoute(
    request("/platform/credentials", {
      platformActorId: "new-operator",
      permissions: ["provider_catalogue:manage"],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }), res, "/platform/credentials", deps,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(deps.calls.some(([kind]) => kind === "issue"), false);
});

test("credential management rejects an unauthenticated issuer", async () => {
  process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED = "true";
  const deps = dependencies({ principal: null }), res = response();
  await handlePlatformAdminCredentialManagementRoute(
    request("/platform/credentials", {}, "Bearer invalid-token"), res, "/platform/credentials", deps,
  );
  assert.equal(res.statusCode, 401);
  assert.equal(deps.calls.some(([kind]) => kind === "issue"), false);
});

test("credential revoke derives the revoking actor from the durable issuer", async () => {
  process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED = "true";
  const deps = dependencies(), res = response();
  await handlePlatformAdminCredentialManagementRoute(
    request("/platform/credentials/credential-to-revoke/revoke", {}), res,
    "/platform/credentials/credential-to-revoke/revoke", deps,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(deps.calls.find(([kind]) => kind === "revoke")[1], {
    correlationId: "credential-route-test", environment: "sandbox", serviceVersion: "test-build",
    actorId: "root-operator", credentialId: "credential-to-revoke",
  });
});

test("credential management route is hidden unless explicitly enabled", async () => {
  delete process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED;
  const deps = dependencies(), res = response();
  await handlePlatformAdminCredentialManagementRoute(
    request("/platform/credentials", {}), res, "/platform/credentials", deps,
  );
  assert.equal(res.statusCode, 404);
});

test.after(() => {
  if (originalEnabled === undefined) delete process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED;
  else process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED = originalEnabled;
});
