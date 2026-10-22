import test from "node:test";
import assert from "node:assert/strict";
import { authorizeApplicationAction } from "../dist/packages/tenant/application-access.js";

const principal = {
  principalId: "user-a",
  tenantIds: ["tenant-a"],
  platformAdmin: false,
};
const scope = { tenantId: "tenant-a", applicationId: "app-a", environment: "uat" };
const grant = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  environment: "uat",
  principalId: "user-a",
  actions: ["application:read", "kpi:read"],
  effect: "ALLOW",
  active: true,
};

test("application grant permits only the exact tenant, app, environment, principal, and action", () => {
  assert.deepEqual(authorizeApplicationAction(principal, scope, "kpi:read", [grant]), {
    allowed: true, reason: "APPLICATION_GRANT",
  });
  assert.deepEqual(authorizeApplicationAction(principal, scope, "kpi:export", [grant]), {
    allowed: false, reason: "ACTION_NOT_GRANTED",
  });
  assert.deepEqual(authorizeApplicationAction(principal, { ...scope, environment: "production" }, "kpi:read", [grant]), {
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
  assert.deepEqual(authorizeApplicationAction(principal, { ...scope, applicationId: "app-b" }, "kpi:read", [grant]), {
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

test("explicit deny overrides a matching allow grant", () => {
  const deny = { ...grant, effect: "DENY" };
  assert.deepEqual(authorizeApplicationAction(principal, scope, "kpi:read", [grant, deny]), {
    allowed: false, reason: "EXPLICIT_DENY",
  });
});

test("trusted platform administrator is explicitly distinguished from tenant grants", () => {
  assert.deepEqual(authorizeApplicationAction({ ...principal, platformAdmin: true }, { ...scope, tenantId: "tenant-b", applicationId: "app-z" }, "audit:read", []), {
    allowed: true, reason: "PLATFORM_ADMIN",
  });
});

test("unknown environment fails closed", () => {
  assert.deepEqual(authorizeApplicationAction(principal, { ...scope, environment: "preview" }, "kpi:read", [grant]), {
    allowed: false, reason: "ENVIRONMENT_SCOPE_DENIED",
  });
});
