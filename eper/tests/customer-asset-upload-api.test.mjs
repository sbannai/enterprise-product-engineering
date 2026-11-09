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
  "EPER_CUSTOMER_ASSET_UPLOAD_API_ENABLED", "EPER_CUSTOMER_ASSET_METADATA_API_ENABLED", "EPER_CUSTOMER_ASSETS_API_ENABLED", "EPER_CUSTOMER_ASSET_PERSISTENCE",
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
function options(calls, withProvider = false, replay = false) {
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
          disposition: replay ? "replayed" : "created", uploadSessionId: "session-upload-001", providerUploadReference: null,
          uploadStatus: "initiated", expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          providerGrantExpiresAt: null,
        };
      },
      async recordUploadProviderRejection() { throw new Error("unexpected rejection"); },
      async recordUploadGrant(input) {
        calls.push("record-grant");
        if (!withProvider) throw new Error("must not persist without a provider");
        assert.equal(input.uploadSessionId, "session-upload-001");
        assert.equal(input.providerUploadReference, "opaque-provider-object-reference");
      },
    },
    ...(withProvider ? {
      assetUploadProviderCapabilities: { idempotentCreateByUploadSessionId: true, lookupByUploadSessionId: true, renewByProviderReference: true },
      ...(replay ? { assetUploadLookupPort: { invoke: async (request, correlationId, operationId) => {
        calls.push("lookup");
        assert.equal(request.uploadSessionId, "session-upload-001");
        assert.equal(correlationId, "upload-api-correlation-001");
        assert.equal(operationId, "session-upload-001");
        return { success: true, value: { kind: "found", providerUploadReference: "opaque-provider-object-reference" } };
      } } } : {}),
      assetUploadPort: {
        async invoke(request, requestId, operationId) {
          calls.push("provider");
          assert.equal(request.uploadSessionId, "session-upload-001");
          assert.equal(request.applicationId, "app-alpha");
          if (replay) assert.equal(request.providerUploadReference, "opaque-provider-object-reference");
          assert.equal(requestId, "upload-api-correlation-001");
          assert.equal(operationId, "session-upload-001");
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
async function withServer(t, handler, withProvider = false, replay = false, configureOptions = () => {}) {
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  configure();
  if (withProvider) process.env.EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON = JSON.stringify(["uploads.example.test"]);
  const calls = [];
  const serverOptions = options(calls, withProvider, replay);
  configureOptions(serverOptions, calls);
  const server = createAppServer(serverOptions);
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
      body: JSON.stringify({ expectedSizeBytes: 1024, expectedChecksumSha256: "a".repeat(64), fileName: "brief.pdf", mimeType: "application/pdf" }),
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
      body: JSON.stringify({ expectedSizeBytes: 1024, expectedChecksumSha256: "a".repeat(64), fileName: "brief.pdf", mimeType: "application/pdf" }),
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
      body: JSON.stringify({ expectedSizeBytes: 1024, expectedChecksumSha256: "a".repeat(64), fileName: "brief.pdf", mimeType: "application/pdf" }),
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


test("upload grant endpoint wires provider lookup for replay and renews the exact recovered object", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/upload-grant", {
      method: "POST",
      headers: { origin, cookie, "x-csrf-token": csrf, "x-correlation-id": "upload-api-correlation-001",
        "idempotency-key": "upload-request-key-0001", "content-type": "application/json" },
      body: JSON.stringify({ expectedSizeBytes: 1024, expectedChecksumSha256: "a".repeat(64), fileName: "brief.pdf", mimeType: "application/pdf" }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.uploadSessionId, "session-upload-001");
    assert.equal(JSON.stringify(payload).includes("opaque-provider-object-reference"), false);
    assert.deepEqual(calls, ["session", "tenant", "actor", "roles", "permission", "reserve", "lookup", "provider", "record-grant"]);
  }, true, true);
});


test("upload completion verifies the persisted provider object and atomically hands off to scanning", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/uploads/session-upload-001/complete", {
      method: "POST",
      headers: { origin, cookie, "x-csrf-token": csrf, "x-correlation-id": "upload-complete-correlation-01" },
      body: JSON.stringify({ checksumSha256: "f".repeat(64), scanStatus: "clean" }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, { assetId: "asset-01", uploadStatus: "scanning", scanStatus: "pending" });
    assert.equal(JSON.stringify(payload).includes("opaque-provider-object-reference"), false);
    assert.deepEqual(calls, ["session", "tenant", "actor", "roles", "permission", "load-upload-session", "verify-provider-object", "complete-upload"]);
  }, false, false, (serverOptions, calls) => {
    serverOptions.customerAssetRepository.getUploadSessionForVerification = async (tenantId, applicationId, uploadSessionId) => {
      calls.push("load-upload-session");
      assert.deepEqual([tenantId, applicationId, uploadSessionId], ["tenant-alpha", "app-alpha", "session-upload-001"]);
      return {
        assetId: "asset-01", actorId: "actor-alpha", providerUploadReference: "opaque-provider-object-reference",
        expectedSizeBytes: 1024, expectedChecksumSha256: "a".repeat(64), expectedMimeType: "application/pdf", expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    };
    serverOptions.assetUploadVerification = async (request, requestId) => {
      calls.push("verify-provider-object");
      assert.equal(requestId, "upload-complete-correlation-01");
      assert.deepEqual(request, {
        tenantId: "tenant-alpha", applicationId: "app-alpha", assetId: "asset-01",
        uploadSessionId: "session-upload-001", providerUploadReference: "opaque-provider-object-reference",
        expectedSizeBytes: 1024, expectedMimeType: "application/pdf", expectedSha256: "a".repeat(64),
      });
      return { sizeBytes: 1024, detectedMimeType: "application/pdf", checksumSha256: "a".repeat(64) };
    };
    serverOptions.customerAssetRepository.completeUpload = async input => {
      calls.push("complete-upload");
      assert.deepEqual(input, {
        tenantId: "tenant-alpha", applicationId: "app-alpha", actorId: "actor-alpha", environment: "uat",
        correlationId: "upload-complete-correlation-01", uploadSessionId: "session-upload-001",
        receivedSizeBytes: 1024, observedMimeType: "application/pdf",
        checksumSha256: "a".repeat(64), scanStatus: "pending",
      });
      return { assetId: "asset-01", uploadStatus: "scanning", scanStatus: "pending" };
    };
  });
});

test("upload completion rejects unverified provider objects without completing or trusting client metadata", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/uploads/session-upload-001/complete", {
      method: "POST",
      headers: { origin, cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ checksumSha256: "a".repeat(64), mimeType: "application/pdf", scanStatus: "clean" }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "uploaded_object_not_verified" });
    assert.equal(calls.includes("complete-upload"), false);
  }, false, false, (serverOptions, calls) => {
    serverOptions.customerAssetRepository.getUploadSessionForVerification = async () => ({
      assetId: "asset-01", actorId: "actor-alpha", providerUploadReference: "opaque-provider-object-reference",
      expectedSizeBytes: 1024, expectedChecksumSha256: "a".repeat(64), expectedMimeType: "application/pdf", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    serverOptions.assetUploadVerification = async () => { calls.push("verify-provider-object"); return null; };
    serverOptions.customerAssetRepository.completeUpload = async () => { calls.push("complete-upload"); throw new Error("must not complete"); };
  });
});

test("upload completion fails closed when trusted verification is not configured", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/uploads/session-upload-001/complete", {
      method: "POST", headers: { origin, cookie, "x-csrf-token": csrf },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "customer_asset_upload_verification_unavailable" });
    assert.deepEqual(calls, ["session", "tenant", "actor", "roles", "permission"]);
  });
});


test("upload completion rejects invalid CSRF origin before session or repository access", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/uploads/session-upload-001/complete", {
      method: "POST",
      headers: { origin: "https://attacker.example.test", cookie, "x-csrf-token": csrf },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "csrf_invalid" });
    assert.deepEqual(calls, []);
  }, false, false, (serverOptions, calls) => {
    serverOptions.customerAssetRepository.getUploadSessionForVerification = async () => {
      calls.push("load-upload-session"); throw new Error("must not access repository");
    };
    serverOptions.assetUploadVerification = async () => { calls.push("verify-provider-object"); return null; };
  });
});

test("upload completion rejects malformed or mismatched trusted verification metadata", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/uploads/session-upload-001/complete", {
      method: "POST",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "uploaded_object_not_verified" });
    assert.equal(calls.includes("complete-upload"), false);
  }, false, false, (serverOptions, calls) => {
    serverOptions.customerAssetRepository.getUploadSessionForVerification = async () => ({
      assetId: "asset-01", actorId: "actor-alpha", providerUploadReference: "opaque-provider-object-reference",
      expectedSizeBytes: 1024, expectedChecksumSha256: "a".repeat(64), expectedMimeType: "application/pdf", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    serverOptions.assetUploadVerification = async () => ({
      sizeBytes: 2048, detectedMimeType: "application/pdf", checksumSha256: "a".repeat(64),
    });
    serverOptions.customerAssetRepository.completeUpload = async () => { calls.push("complete-upload"); throw new Error("must not complete"); };
  });
});


test("metadata create endpoint enforces browser authorization and assigns server-owned pending storage identity", async t => {
  let createdInput;
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/assets?applicationId=app-alpha", {
      method: "POST",
      headers: { origin, cookie, "x-csrf-token": csrf, "idempotency-key": "a".repeat(32),
        "content-type": "application/json" },
      body: JSON.stringify({
        scope: "application_restricted", displayName: "Project brief",
        originalFileName: "brief.pdf", mediaCategory: "document",
        mimeType: "application/pdf", fileExtension: "pdf", sizeBytes: 2048,
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 201, `metadata create response: ${JSON.stringify({ body, calls })}`);
    assert.equal(body.assetId, "asset-created-001");
    assert.equal(body.applicationId, "app-alpha");
    assert.equal(body.uploadStatus, "pending");
    assert.equal("storageObjectReference" in body, false);
    assert.equal("providerUploadReference" in body, false);
    assert.ok(calls.includes("create"));
    assert.ok(calls.includes("session"));
    assert.ok(calls.includes("permission"));
  }, false, false, (serverOptions, calls) => {
    process.env.EPER_CUSTOMER_ASSET_METADATA_API_ENABLED = "true";
    serverOptions.customerAssetRepository.create = async input => {
      createdInput = input;
      calls.push("create");
      return {
        assetId: "asset-created-001", scope: input.scope, displayName: input.displayName,
        originalFileName: input.originalFileName, mediaCategory: input.mediaCategory,
        mimeType: input.mimeType, fileExtension: input.fileExtension, sizeBytes: input.sizeBytes,
        uploadStatus: "pending", scanStatus: "pending",
      };
    };
  });
  assert.equal(createdInput.tenantId, "tenant-alpha");
  assert.equal(createdInput.applicationId, "app-alpha");
  assert.equal(createdInput.actorId, "actor-alpha");
  assert.equal(createdInput.ownerApplicationId, "app-alpha");
  assert.equal(createdInput.clientOperationId, "a".repeat(32));
  assert.equal(createdInput.storageAdapterKey, "pending");
  assert.match(createdInput.storageObjectReference, /^pending:/);
});

test("metadata create endpoint rejects invalid CSRF before identity or repository access", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/assets?applicationId=app-alpha", {
      method: "POST",
      headers: { origin: "https://attacker.example.test", cookie, "x-csrf-token": csrf,
        "idempotency-key": "b".repeat(32), "content-type": "application/json" },
      body: JSON.stringify({ scope: "application_restricted" }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "csrf_invalid" });
    assert.deepEqual(calls, []);
  }, false, false, () => { process.env.EPER_CUSTOMER_ASSET_METADATA_API_ENABLED = "true"; });
});


test("metadata API advertises GET and POST and rejects unsupported methods", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/assets?applicationId=app-alpha", {
      method: "PUT",
      headers: { origin, cookie, "x-csrf-token": csrf, "content-type": "application/json" },
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, POST");
    assert.deepEqual(calls, []);
  }, false, false, () => {
    process.env.EPER_CUSTOMER_ASSET_METADATA_API_ENABLED = "true";
    process.env.EPER_CUSTOMER_ASSETS_API_ENABLED = "true";
  });
});


test("upload completion rejects provider-observed checksum that differs from the persisted expected checksum", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/uploads/session-upload-001/complete", {
      method: "POST", headers: { origin, cookie, "x-csrf-token": csrf }, body: JSON.stringify({}),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "uploaded_object_not_verified" });
    assert.equal(calls.includes("complete-upload"), false);
  }, false, false, serverOptions => {
    serverOptions.customerAssetRepository.getUploadSessionForVerification = async () => ({
      assetId: "asset-01", actorId: "actor-alpha", providerUploadReference: "opaque-provider-object-reference",
      expectedSizeBytes: 1024, expectedChecksumSha256: "b".repeat(64), expectedMimeType: "application/pdf",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    serverOptions.assetUploadVerification = async request => {
      assert.equal(request.expectedSha256, "b".repeat(64));
      return { sizeBytes: 1024, detectedMimeType: "application/pdf", checksumSha256: "a".repeat(64) };
    };
    serverOptions.customerAssetRepository.completeUpload = async () => { throw new Error("must not complete"); };
  });
});


test("upload grant endpoint rejects missing or malformed expected SHA-256 before reserving", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/upload-grant", {
      method: "POST", headers: { origin, cookie, "x-csrf-token": csrf,
        "idempotency-key": "upload-request-key-0001", "content-type": "application/json" },
      body: JSON.stringify({ expectedSizeBytes: 1024, fileName: "brief.pdf", mimeType: "application/pdf" }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_upload_request" });
    assert.deepEqual(calls, ["session", "tenant", "actor", "roles", "permission"]);
  }, true);
});


test("legacy upload session without a persisted expected checksum fails closed before provider verification", async t => {
  await withServer(t, async (base, calls) => {
    const response = await fetch(base + "/customer/applications/app-alpha/assets/asset-01/uploads/session-upload-001/complete", {
      method: "POST", headers: { origin, cookie, "x-csrf-token": csrf }, body: JSON.stringify({}),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "uploaded_object_not_verified" });
    assert.equal(calls.includes("verify-provider-object"), false);
    assert.equal(calls.includes("complete-upload"), false);
  }, false, false, serverOptions => {
    serverOptions.customerAssetRepository.getUploadSessionForVerification = async () => ({
      assetId: "asset-01", actorId: "actor-alpha", providerUploadReference: "opaque-provider-object-reference",
      expectedSizeBytes: 1024, expectedChecksumSha256: null, expectedMimeType: "application/pdf",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    serverOptions.assetUploadVerification = async () => { throw new Error("legacy checksum must fail before provider verification"); };
    serverOptions.customerAssetRepository.completeUpload = async () => { throw new Error("legacy checksum must not complete"); };
  });
});
