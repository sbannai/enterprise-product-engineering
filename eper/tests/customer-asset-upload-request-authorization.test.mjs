import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeCustomerAssetUploadBrowserRequest,
} from "../dist/packages/assets/customer-asset-upload-request-authorization.js";
import {
  CUSTOMER_SESSION_COOKIE, CUSTOMER_CSRF_COOKIE, createCustomerCsrfToken,
} from "../dist/packages/identity/customer-browser-security.js";

const origin = "https://eper.example.test";
const secret = "0123456789abcdef0123456789abcdef";
const sessionToken = "A".repeat(43);
const csrf = createCustomerCsrfToken(sessionToken, secret);
const cookieHeader = `${CUSTOMER_SESSION_COOKIE}=${sessionToken}; ${CUSTOMER_CSRF_COOKIE}=${csrf}`;
const request = {
  method: "POST", origin, cookieHeader, csrfHeader: csrf, applicationId: "app-alpha",
};
const session = {
  tenantId: "tenant-alpha", actorId: "actor-alpha",
  issuer: "https://identity.example.test", subject: "subject-alpha",
  createdAt: "2026-11-01T00:00:00.000Z", lastSeenAt: "2026-11-07T00:00:00.000Z",
  idleExpiresAt: "2026-11-08T00:00:00.000Z", absoluteExpiresAt: "2026-12-01T00:00:00.000Z",
};
function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    value: {
      expectedOrigin: origin, csrfSecret: secret,
      sessionStore: { async resolveSession(token) { calls.push(["session", token]); return session; } },
      tenantAssignments: { async listActive(tenantId) { calls.push(["tenant", tenantId]); return ["app-alpha"]; } },
      actorAssignments: { async isAssigned(tenantId, actorId, applicationId) {
        calls.push(["actor", tenantId, actorId, applicationId]); return true;
      } },
      roleAssignments: {
        async listActiveRoleIds(tenantId, applicationId, actorId) {
          calls.push(["roles", tenantId, applicationId, actorId]); return ["role-reader", "role-uploader"];
        },
        async hasPermission(tenantId, applicationId, actorId, roleId, permission) {
          calls.push(["permission", roleId, permission]); return roleId === "role-uploader" && permission === "customer.asset.upload";
        },
      },
      ...overrides,
    },
  };
}

test("upload browser guard requires CSRF before any identity or authorization database lookup", async () => {
  const d = dependencies();
  const result = await authorizeCustomerAssetUploadBrowserRequest(
    { ...request, origin: "https://attacker.example.test" }, d.value,
  );
  assert.deepEqual(result, { allowed: false, reason: "csrf_invalid" });
  assert.deepEqual(d.calls, []);
});

test("upload browser guard rejects missing and duplicate security cookies before database access", async () => {
  for (const alteredCookie of [
    `${CUSTOMER_SESSION_COOKIE}=${sessionToken}`,
    `${cookieHeader}; ${CUSTOMER_SESSION_COOKIE}=${sessionToken}`,
  ]) {
    const d = dependencies();
    const result = await authorizeCustomerAssetUploadBrowserRequest(
      { ...request, cookieHeader: alteredCookie }, d.value,
    );
    assert.deepEqual(result, { allowed: false, reason: "csrf_invalid" });
    assert.deepEqual(d.calls, []);
  }
});

test("upload browser guard authorizes only the exact durable session, application assignment and explicit role permission", async () => {
  const d = dependencies();
  const result = await authorizeCustomerAssetUploadBrowserRequest(request, d.value);
  assert.deepEqual(result, {
    allowed: true,
    identity: { tenantId: "tenant-alpha", actorId: "actor-alpha", applicationId: "app-alpha" },
  });
  assert.deepEqual(d.calls.slice(0, 3), [
    ["session", sessionToken],
    ["tenant", "tenant-alpha"],
    ["actor", "tenant-alpha", "actor-alpha", "app-alpha"],
  ]);
  assert.ok(d.calls.some(call => call[0] === "permission" && call[1] === "role-uploader"));
});

test("upload browser guard denies missing application assignment and missing upload permission", async () => {
  const noApplication = dependencies({
    actorAssignments: { async isAssigned() { return false; } },
  });
  assert.deepEqual(
    await authorizeCustomerAssetUploadBrowserRequest(request, noApplication.value),
    { allowed: false, reason: "identity_unavailable" },
  );
  const noPermission = dependencies({
    roleAssignments: {
      async listActiveRoleIds() { return ["role-reader"]; },
      async hasPermission() { return false; },
    },
  });
  assert.deepEqual(
    await authorizeCustomerAssetUploadBrowserRequest(request, noPermission.value),
    { allowed: false, reason: "permission_denied" },
  );
});

test("upload browser guard propagates authorization-store outages rather than granting access", async () => {
  const d = dependencies({
    roleAssignments: {
      async listActiveRoleIds() { throw new Error("database unavailable"); },
      async hasPermission() { return true; },
    },
  });
  await assert.rejects(
    () => authorizeCustomerAssetUploadBrowserRequest(request, d.value),
    /database unavailable/,
  );
});
