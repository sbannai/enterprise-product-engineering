import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformApplicationRemediationRoute } from "../dist/apps/api/platform-application-remediation-route.js";

const credential = "platform-remediation-route-credential-0001";
const previousMapping = process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON;
const previousEnabled = process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED;
function request({ authorization = "Bearer " + credential, method = "POST", body = {}, idempotencyKey = "remediate-01" } = {}) {
  const bytes = Buffer.from(JSON.stringify(body));
  return { method, headers: { authorization, "idempotency-key": idempotencyKey },
    async *[Symbol.asyncIterator]() { yield bytes; } };
}
function response() {
  return { statusCode: 0, headers: {}, body: "",
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(body) { this.body = body ?? ""; } };
}
function setMapping(permissions = ["application:remediate"]) {
  process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON = JSON.stringify({
    [credential]: { platformActorId: "platform-remediator-01", credentialId: "platform-key-03", permissions },
  });
}
const pathname = "/platform/tenants/tenant-01/applications/app-01/remediation";

test("platform remediation route derives authority and resource scope from trusted sources", async () => {
  process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED = "true";
  setMapping();
  let captured;
  const res = response();
  const handled = await handlePlatformApplicationRemediationRoute(
    request({ body: { expectedAssignmentVersion: 4, reasonTicketReference: "INC-42" } }),
    res, pathname, { environment: "sandbox", store: { async remediate(input) {
      captured = input;
      return { tenantId: input.tenantId, applicationId: input.applicationId, assignmentStatus: "revoked",
        assignmentVersion: 5, activeApplicationCount: 1, maxApplications: 1,
        tariffAccessState: "within_allowance", evaluatedAt: "2026-11-02T00:00:00.000Z",
        correlationId: input.correlationId, replayed: false };
    } } },
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(captured.principal.platformActorId, "platform-remediator-01");
  assert.equal(captured.tenantId, "tenant-01");
  assert.equal(captured.applicationId, "app-01");
  assert.equal(captured.expectedAssignmentVersion, 4);
  assert.equal(captured.reasonTicketReference, "INC-42");
});

test("platform remediation route rejects forged authority fields", async () => {
  process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED = "true";
  setMapping();
  const res = response();
  await handlePlatformApplicationRemediationRoute(
    request({ body: { expectedAssignmentVersion: 4, reasonTicketReference: "INC-42", platformActorId: "forged" } }),
    res, pathname, { environment: "sandbox", store: { async remediate() { throw new Error("MUST_NOT_CALL"); } } },
  );
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "invalid_platform_application_remediation_body");
});

test("platform remediation route rejects credentials without independent remediation permission", async () => {
  process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED = "true";
  setMapping(["customer_admin:recover"]);
  const res = response();
  await handlePlatformApplicationRemediationRoute(
    request({ body: { expectedAssignmentVersion: 4, reasonTicketReference: "INC-42" } }),
    res, pathname, { environment: "sandbox", store: { async remediate() { throw new Error("MUST_NOT_CALL"); } } },
  );
  assert.equal(res.statusCode, 403);
});

test("platform remediation route is hidden while disabled and POST-only while enabled", async () => {
  delete process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED;
  const hidden = response();
  await handlePlatformApplicationRemediationRoute(request(), hidden, pathname, {});
  assert.equal(hidden.statusCode, 404);
  process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED = "true";
  const wrongMethod = response();
  await handlePlatformApplicationRemediationRoute(request({ method: "GET" }), wrongMethod, pathname, {});
  assert.equal(wrongMethod.statusCode, 405);
});


test("platform remediation UI is same-origin, no-store and CSP-nonced", async () => {
  process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED = "true";
  const res = response();
  await handlePlatformApplicationRemediationRoute(
    request({ method: "GET", body: {} }), res, "/platform/application-remediation/ui",
    { environment: "sandbox", store: { async remediate() { throw new Error("MUST_NOT_CALL"); } } },
  );
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-security-policy"], /script-src 'nonce-/);
  assert.match(res.headers["content-security-policy"], /connect-src 'self'/);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.match(res.body, /Expected assignment version/);
  assert.match(res.body, /mandatory incident\/ticket reference and reason/i);
  assert.match(res.body, /confirm\(/);
  assert.match(res.body, /application:remediate/);
  assert.doesNotMatch(res.body, /localStorage|sessionStorage/);
});

test("platform remediation UI is hidden when feature is disabled", async () => {
  delete process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED;
  const res = response();
  await handlePlatformApplicationRemediationRoute(
    request({ method: "GET", body: {} }), res, "/platform/application-remediation/ui",
    { environment: "sandbox", store: { async remediate() { throw new Error("MUST_NOT_CALL"); } } },
  );
  assert.equal(res.statusCode, 404);
});

test.after(() => {
  if (previousMapping === undefined) delete process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON;
  else process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON = previousMapping;
  if (previousEnabled === undefined) delete process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED;
  else process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED = previousEnabled;
});
