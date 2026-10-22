import test from "node:test";
import assert from "node:assert/strict";
import { authorizeApplicationAction } from "../dist/packages/tenant/application-access.js";

const principal = {
  principalId: "user-a",
  tenantIds: ["tenant-a"],
  platformAdmin: false,
};
const scope = { tenantId: "tenant-a", applicationId: "app-a" };
const grant = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  principalId: "user-a",
  actions: ["application:read", "kpi:read"],
  active: true,
};

test("application grant permits only the exact tenant, app, principal, and action", () => {
  assert.deepEqual(authorizeApplicationAction(principal, scope, "kpi:read", [grant]), {
    allowed: true, reason: "APPLICATION_GRANT",
  });
  assert.deepEqual(authorizeApplicationAction(principal, scope, "kpi:export", [grant]), {
    allowed: false, reason: "ACTION_NOT_GRANTED",
  });
});

test("missing principal and tenant mismatch fail closed", () => {
  assert.deepEqual(authorizeApplicationAction(null, scope, "kpi:read", [grant]), {
    allowed: false, reason: "PRINCIPAL_REQUIRED",
  });
  assert.deepEqual(authorizeApplicationAction(principal, { ...scope, tenantId: "tenant-b" }, "kpi:read", [grant]), {
    allowed: false, reason: "TENANT_SCOPE_DENIED",
  });
});

test("same-tenant application membership does not imply access to another application", () => {
  assert.deepEqual(authorizeApplicationAction(principal, { tenantId: "tenant-a", applicationId: "app-b" }, "kpi:read", [grant]), {
    allowed: false, reason: "APPLICATION_GRANT_REQUIRED",
  });
});

test("inactive and other-principal grants do not authorize access", () => {
  const inactive = { ...grant, active: false };
  const otherPrincipal = { ...grant, principalId: "user-b" };
  assert.deepEqual(authorizeApplicationAction(principal, scope, "kpi:read", [inactive, otherPrincipal]), {
    allowed: false, reason: "APPLICATION_GRANT_REQUIRED",
  });
});

test("trusted platform administrator is explicitly distinguished from tenant grants", () => {
  assert.deepEqual(authorizeApplicationAction({ ...principal, platformAdmin: true }, { tenantId: "tenant-b", applicationId: "app-z" }, "audit:read", []), {
    allowed: true, reason: "PLATFORM_ADMIN",
  });
});
