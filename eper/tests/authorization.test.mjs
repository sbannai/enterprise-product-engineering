import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAuthorizationService } from "../dist/packages/capabilities/authorization.js";

test("authorization allows a matching tenant principal action and resource", () => {
  const service = new InMemoryAuthorizationService();
  service.addPolicy({
    tenantId: "tenant-a",
    principalId: "user-a",
    actions: ["READ"],
    resources: ["record:r1"],
    effect: "ALLOW",
  });

  const decision = service.decide({
    tenantId: "tenant-a",
    principalId: "user-a",
    action: "READ",
    resource: "record:r1",
  });

  assert.equal(decision.effect, "ALLOW");
  assert.equal(decision.reason, "ALLOW_POLICY_MATCH");
});

test("authorization denies requests without an allow policy", () => {
  const service = new InMemoryAuthorizationService();
  service.addPolicy({
    tenantId: "tenant-a",
    principalId: "user-a",
    actions: ["READ"],
    resources: ["record:r1"],
    effect: "ALLOW",
  });

  const decision = service.decide({
    tenantId: "tenant-a",
    principalId: "user-a",
    action: "WRITE",
    resource: "record:r1",
  });

  assert.equal(decision.effect, "DENY");
  assert.equal(decision.reason, "NO_ALLOW_POLICY");
});

test("authorization deny policy takes precedence over allow", () => {
  const service = new InMemoryAuthorizationService();
  service.addPolicy({
    tenantId: "tenant-a",
    principalId: "user-a",
    actions: ["DELETE"],
    resources: ["record:r1"],
    effect: "ALLOW",
  });
  service.addPolicy({
    tenantId: "tenant-a",
    principalId: "user-a",
    actions: ["DELETE"],
    resources: ["record:r1"],
    effect: "DENY",
  });

  const decision = service.decide({
    tenantId: "tenant-a",
    principalId: "user-a",
    action: "DELETE",
    resource: "record:r1",
  });

  assert.equal(decision.effect, "DENY");
  assert.equal(decision.reason, "EXPLICIT_DENY_POLICY");
});

test("authorization rejects incomplete context", () => {
  const service = new InMemoryAuthorizationService();
  assert.throws(
    () => service.decide({ tenantId: "", principalId: "user-a", action: "READ", resource: "record:r1" }),
    /AUTHORIZATION_CONTEXT_REQUIRED/,
  );
});

test("authorization rejects malformed policies without mutating policy state", () => {
  const service = new InMemoryAuthorizationService();
  assert.throws(() => service.addPolicy(null), /AUTHORIZATION_POLICY_INVALID/);
  assert.throws(() => service.addPolicy({ tenantId: "tenant-a", actions: "READ", resources: ["record:r1"], effect: "ALLOW" }), /AUTHORIZATION_POLICY_INVALID/);
  assert.throws(() => service.addPolicy({ tenantId: "tenant-a", actions: [" "], resources: ["record:r1"], effect: "ALLOW" }), /AUTHORIZATION_POLICY_INVALID/);
  assert.throws(() => service.addPolicy({ tenantId: "tenant-a", actions: ["READ"], resources: ["record:r1"], effect: "MAYBE" }), /AUTHORIZATION_POLICY_INVALID/);
  assert.equal(service.snapshot().length, 0);
});

test("authorization rejects malformed requests with a stable context error", () => {
  const service = new InMemoryAuthorizationService();
  assert.throws(() => service.decide(null), /AUTHORIZATION_CONTEXT_REQUIRED/);
  assert.throws(() => service.decide({ tenantId: "tenant-a", principalId: "user-a", action: 7, resource: "record:r1" }), /AUTHORIZATION_CONTEXT_REQUIRED/);
});
