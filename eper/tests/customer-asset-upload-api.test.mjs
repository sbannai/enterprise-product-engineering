import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";
import {
  CUSTOMER_SESSION_COOKIE, CUSTOMER_CSRF_COOKIE, createCustomerCsrfToken,
} from "../dist/packages/identity/customer-browser-security.js";

const origin = "https://eper.example.test";
const secret = "0123456789abcdef0123456789abcdef";
const sessionToken = "A".repeat(43);
const csrf = createCustomerCsrfToken(sessionToken, secret);
const cookie = `${CUSTOMER_SESSION_COOKIE}=${sessionToken}; ${CUSTOMER_CSRF_COOKIE}=${csrf}`;
const envKeys = [
  "EPER_CUSTOMER_ASSET_UPLOAD_API_ENABLED", "EPER_CUSTOMER_ASSET_PERSISTENCE",
  "EPER_CUSTOMER_IDENTITY_PERSISTENCE", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
  "EPER_AUDIT_PERSISTENCE", "EPER_CUSTOMER_OIDC_ENABLED", "EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON",
];
function configure() {
  for (const [key, value] of Object.entries({
    EPER_CUSTOMER_ASSET_UPLOAD_API_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_CUSTOMER_IDENTITY_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_OIDC_ENABLED: "true",
  })) process.env[key] = value;
}
function options(calls, withProvider = false) {
  return {
    adminConfigEnvironment: "uat",
    customerOidcPublicOrigin: origin,
    customerCsrfSecret: secret,
    customerIdentitySessionStore: {
      async resolveSession(token) {
        calls.push("session");
        assert.equal(token, sessionToken);
        return {
          tenantId: "tenant-alpha", actorId: "actor-alpha",
          issuer: "https://identity.example.test", subject: "subject-alpha",
          createdAt: "2026-11-01T00:00:00.000Z", lastSeenAt: "2026-11-07T00:00:00.000Z",
          idleExpiresAt: "2026-11-08T00:00:00.000Z", absoluteExpiresAt: "2026-12-01T00:00:00.000Z",
        };
      },
    },
    tenantApplicationAssignmentStore: {
      async listActive(tenantId) { calls.push("tenant"); assert.equal(tenantId, "tenant-alpha"); return ["app-alpha"]; },
    },
    actorApplicationAssignmentStore: {
      async isAssigned(tenantId, actorId, appId) {
        calls.push("actor");
        return tenantId === "tenant-alpha" && actorId === "actor-alpha" && appId === "app-alpha";
      },
    },
    workflowActorRoleAssignmentStore: {
      async listActiveRoleIds() { calls.push("roles"); return ["asset-uploader"]; },
      async hasPermission(_tenant, _app, _actor, role, permission) {
        calls.push("permission");
        return role === "asset-uploader" && permission === "customer.asset.upload";
      },
    },
    customerAssetRepository: {
      async assertReady() {},
      async reserveUpload(input) {
        calls.push("reserve");
        if (!withProvider) throw new Error("must not reserve without a provider");
        assert.equal(input.applicationId, "app-alpha");
        return {
          disposition: "created", uploadSessionId: "session-upload-001", providerUploadReference: null,
          uploadStatus: "initiated", expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          providerGrantExpiresAt: null,
        };
      },
      async recordUploadGrant(input) {
        calls.push("record-grant");
        if (!withProvider) throw new Error("must not persist without a provider");
        assert.equal(input.uploadSessionId, "session-upload-001");
        assert.equal(input.providerUploadReference, "opaque-provider-object-reference");
      },
    },
    ...(withProvider ? {
      assetUploadPort: {
        async invoke(request, requestId) {
          calls.push("provider");
          assert.equal(request.uploadSessionId, "session-upload-001");
          assert.equal(request.applicationId, "app-alpha");
          assert.equal(requestId, "upload-api-correlation-001");
          return {
            success: true,
            externalReference: "opaque-provider-object-reference",
            value: {
              url: "https://uploads.example.test/put/object?signature=redacted",
              method: "PUT",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
              headers: { "content-type": "application/pdf" },
            },
          };
        },
      },
    } : {}),
  };
}
async function withServer(t, handler, withProvider = false) {
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  configure();
  if (withProvider) process.env.EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON = JSON.stringify(["uploads.example.test"]);
  const calls = [];
  const server = createAppServer(options(calls, withProvider));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  await handler(base, calls);
}

test("upload grant endpoint performs CSRF before database authorization and rejects invalid origin", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/upload-grant", {
      method: "POST",
      headers: { origin: "https://attacker.example.test", cookie, "x-csrf-token": csrf,
        "idempotency-key": "upload-request-key-0001", "content-type": "application/json" },
      body: JSON.stringify({ expectedSizeBytes: 1024, fileName: "brief.pdf", mimeType: "application/pdf" }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "csrf_invalid" });
    assert.deepEqual(calls, []);
  });
});

test("upload grant endpoint authorizes durable role but fails closed when no trusted storage provider is configured", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/upload-grant", {
      method: "POST",
      headers: { origin, cookie, "x-csrf-token": csrf,
        "idempotency-key": "upload-request-key-0001", "content-type": "application/json" },
      body: JSON.stringify({ expectedSizeBytes: 1024, fileName: "brief.pdf", mimeType: "application/pdf" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "customer_asset_upload_provider_unavailable" });
    assert.deepEqual(calls, ["session", "tenant", "actor", "roles", "permission"]);
  });
});

test("upload grant endpoint reserves, invokes allowlisted provider, persists reference, and never discloses provider reference", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/upload-grant", {
      method: "POST",
      headers: { origin, cookie, "x-csrf-token": csrf, "x-correlation-id": "upload-api-correlation-001",
        "idempotency-key": "upload-request-key-0001", "content-type": "application/json" },
      body: JSON.stringify({ expectedSizeBytes: 1024, fileName: "brief.pdf", mimeType: "application/pdf" }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.uploadSessionId, "session-upload-001");
    assert.equal(payload.upload.method, "PUT");
    assert.equal(new URL(payload.upload.url).hostname, "uploads.example.test");
    assert.equal(JSON.stringify(payload).includes("opaque-provider-object-reference"), false);
    assert.deepEqual(calls, ["session", "tenant", "actor", "roles", "permission", "reserve", "provider", "record-grant"]);
  }, true);
});
