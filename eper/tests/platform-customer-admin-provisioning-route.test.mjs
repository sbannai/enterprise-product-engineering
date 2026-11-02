import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformCustomerAdminProvisioningRoute } from "../dist/apps/api/platform-customer-admin-provisioning-route.js";

const credential = "platform-route-test-credential-00000001";
const previousMapping = process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON;

function request({ authorization, body = {}, method = "POST" } = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  return {
    method,
    headers: { authorization, "idempotency-key": "request-key-01" },
    async *[Symbol.asyncIterator]() { if (payload.length) yield payload; },
  };
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(body) { this.body = body ?? ""; },
  };
}

function setMapping(permissions = ["customer_admin:provision", "customer_admin:recover"]) {
  process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON = JSON.stringify({
    [credential]: {
      platformActorId: "platform-operator-01",
      permissions,
      credentialId: "platform-key-01",
    },
  });
}

test("platform Customer Admin console is served only when the platform API is enabled", async () => {
  const previousEnabled = process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED;
  process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED = "true";
  try {
    const res = response();
    const handled = await handlePlatformCustomerAdminProvisioningRoute(
      request({ method: "GET" }), res, "/platform/customer-admin-provisioning/ui",
      { environment: "sandbox", store: { async mutate() { throw new Error("MUST_NOT_CALL_STORE"); } } },
    );
    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-security-policy"], /default-src 'none'/);
    assert.doesNotMatch(res.headers["content-security-policy"], /unsafe-inline/);
    const scriptNonce = res.headers["content-security-policy"].match(/script-src 'nonce-([^']+)'/)?.[1];
    const styleNonce = res.headers["content-security-policy"].match(/style-src 'nonce-([^']+)'/)?.[1];
    assert.ok(scriptNonce);
    assert.ok(styleNonce);
    assert.ok(res.body.includes(`<script nonce="${scriptNonce}">`));
    assert.ok(res.body.includes(`<style nonce="${styleNonce}">`));
    assert.match(res.body, /Platform Admin/);
    assert.match(res.body, /customer_admin:recover/);
    assert.match(res.body, /idempotency-key/);
  } finally {
    if (previousEnabled === undefined) delete process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED;
    else process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED = previousEnabled;
  }
});

test("platform Customer Admin console stays hidden when disabled and rejects non-GET methods", async () => {
  const previousEnabled = process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED;
  delete process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED;
  try {
    const disabled = response();
    await handlePlatformCustomerAdminProvisioningRoute(
      request({ method: "GET" }), disabled, "/platform/customer-admin-provisioning/ui",
      { environment: "sandbox", store: { async mutate() { throw new Error("MUST_NOT_CALL_STORE"); } } },
    );
    assert.equal(disabled.statusCode, 404);
    process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED = "true";
    const wrongMethod = response();
    await handlePlatformCustomerAdminProvisioningRoute(
      request({ method: "POST" }), wrongMethod, "/platform/customer-admin-provisioning/ui",
      { environment: "sandbox", store: { async mutate() { throw new Error("MUST_NOT_CALL_STORE"); } } },
    );
    assert.equal(wrongMethod.statusCode, 405);
  } finally {
    if (previousEnabled === undefined) delete process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED;
    else process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED = previousEnabled;
  }
});

test("platform provisioning route denies missing or unknown platform credentials", async () => {
  setMapping();
  const res = response();
  const handled = await handlePlatformCustomerAdminProvisioningRoute(
    request({ authorization: "Bearer " + "x".repeat(40) }),
    res,
    "/platform/tenants/tenant-01/applications/app-01/customer-admins",
    { store: { async mutate() { throw new Error("MUST_NOT_CALL_STORE"); } }, environment: "sandbox" },
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).error, "unauthorized");
});

test("platform route rejects caller-supplied authority fields before store access", async () => {
  setMapping();
  const res = response();
  const handled = await handlePlatformCustomerAdminProvisioningRoute(
    request({
      authorization: "Bearer " + credential,
      body: {
        targetActorId: "actor-01",
        platformActorId: "forged-platform-actor",
        tenantId: "forged-tenant",
        roleId: "product-admin",
      },
    }),
    res,
    "/platform/tenants/tenant-01/applications/app-01/customer-admins",
    { store: { async mutate() { throw new Error("MUST_NOT_CALL_STORE"); } }, environment: "sandbox" },
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "invalid_platform_customer_admin_body");
});

test("platform route derives actor from trusted mapping and resource scope from URL", async () => {
  setMapping(["customer_admin:provision"]);
  const res = response();
  let captured;
  const handled = await handlePlatformCustomerAdminProvisioningRoute(
    request({
      authorization: "Bearer " + credential,
      body: { targetActorId: "actor-01" },
    }),
    res,
    "/platform/tenants/tenant-01/applications/app-01/customer-admins",
    {
      environment: "sandbox",
      serviceVersion: "test-build",
      store: { async mutate(input) {
        captured = input;
        return {
          tenantId: input.tenantId, applicationId: input.applicationId,
          actorId: input.targetActorId, roleId: "customer-admin",
          status: "active", version: 1, operation: input.operation, replayed: false,
        };
      } },
    },
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 201);
  assert.equal(captured.principal.platformActorId, "platform-operator-01");
  assert.equal(captured.tenantId, "tenant-01");
  assert.equal(captured.applicationId, "app-01");
  assert.equal(captured.targetActorId, "actor-01");
  assert.equal(captured.operation, "provision");
  assert.equal(captured.principal.permissions.includes("customer_admin:provision"), true);
});

test("platform recovery route requires explicit reason and recovery permission", async () => {
  setMapping(["customer_admin:provision"]);
  const res = response();
  await handlePlatformCustomerAdminProvisioningRoute(
    request({
      authorization: "Bearer " + credential,
      body: { targetActorId: "actor-01", reasonTicketReference: "INC-1" },
    }),
    res,
    "/platform/tenants/tenant-01/applications/app-01/customer-admin-recovery",
    { environment: "sandbox", store: { async mutate() { throw new Error("MUST_NOT_CALL_STORE"); } } },
  );
  assert.equal(res.statusCode, 403);
});

test("platform route returns 405 for non-POST methods", async () => {
  const res = response();
  await handlePlatformCustomerAdminProvisioningRoute(
    request({ method: "GET" }),
    res,
    "/platform/tenants/tenant-01/applications/app-01/customer-admins",
    {},
  );
  assert.equal(res.statusCode, 405);
});

test.after(() => {
  if (previousMapping === undefined) delete process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON;
  else process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON = previousMapping;
});
