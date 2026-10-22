import test from "node:test";
import assert from "node:assert/strict";
import {
  ApplicationPermissionAdminService,
  InMemoryApplicationGrantStore,
  InMemoryPermissionAuditSink,
} from "../dist/packages/tenant/application-grants.js";

const scope = { tenantId: "tenant-a", applicationId: "app-a", environment: "uat" };
const actor = { principalId: "admin-a", tenantIds: ["tenant-a"], platformAdmin: false };
const managerGrant = {
  ...scope, principalId: "admin-a", actions: ["permission:manage"],
  effect: "ALLOW", active: true,
};
const targetGrant = {
  ...scope, principalId: "user-b", actions: ["run:read", "receipt:download"],
  effect: "ALLOW", active: true,
};

function service(seed = [managerGrant]) {
  const store = new InMemoryApplicationGrantStore(seed);
  const audit = new InMemoryPermissionAuditSink();
  const admin = new ApplicationPermissionAdminService(store, audit, () => "perm_test_1", () => "2026-10-22T09:00:00.000Z");
  return { store, audit, admin };
}

test("permission manager can replace exact-scope grants and emits an audit event", () => {
  const { store, audit, admin } = service();
  const result = admin.replaceGrants(actor, scope, "user-b", [targetGrant]);
  assert.equal(result.ok, true);
  assert.equal(store.list().filter((grant) => grant.principalId === "user-b").length, 1);
  assert.equal(audit.snapshot().length, 1);
  assert.deepEqual(audit.snapshot()[0], {
    eventId: "perm_test_1",
    occurredAt: "2026-10-22T09:00:00.000Z",
    actorPrincipalId: "admin-a",
    targetPrincipalId: "user-b",
    tenantId: "tenant-a",
    applicationId: "app-a",
    environment: "uat",
    action: "permission.grants.replaced",
    grantCount: 1,
  });
});

test("permission changes fail closed without permission:manage", () => {
  const { store, audit, admin } = service([]);
  const result = admin.replaceGrants(actor, scope, "user-b", [targetGrant]);
  assert.deepEqual(result, { ok: false, status: 403, reason: "APPLICATION_GRANT_REQUIRED" });
  assert.equal(store.list().length, 0);
  assert.equal(audit.snapshot().length, 0);
});

test("grant replacement rejects cross-scope or malformed grants without changing state", () => {
  const { store, audit, admin } = service();
  const wrongScope = { ...targetGrant, applicationId: "app-other" };
  const result = admin.replaceGrants(actor, scope, "user-b", [wrongScope]);
  assert.deepEqual(result, { ok: false, status: 400, reason: "INVALID_GRANT_SET" });
  assert.equal(store.list().some((grant) => grant.principalId === "user-b"), false);
  assert.equal(audit.snapshot().length, 0);
});

test("explicit deny grants can be recorded for the same principal and scope", () => {
  const { store, admin } = service();
  const deny = { ...targetGrant, effect: "DENY" };
  const result = admin.replaceGrants(actor, scope, "user-b", [deny]);
  assert.equal(result.ok, true);
  assert.equal(store.list().find((grant) => grant.principalId === "user-b")?.effect, "DENY");
});

test("target principal and action set must be valid", () => {
  const { admin } = service();
  assert.deepEqual(admin.replaceGrants(actor, scope, "user-b", [{
    ...targetGrant, actions: ["superuser:all"],
  }]), { ok: false, status: 400, reason: "INVALID_GRANT_SET" });
  assert.deepEqual(admin.replaceGrants(actor, scope, " ", []), {
    ok: false, status: 400, reason: "INVALID_GRANT_SET",
  });
});
