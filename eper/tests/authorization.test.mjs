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


test("authorization rejects malformed policies without mutating policy store", () => {
  const service = new InMemoryAuthorizationService();
  const invalidPolicies = [
    { tenantId: "", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
    { tenantId: "tenant-a", actions: [], resources: ["record:r1"], effect: "ALLOW" },
    { tenantId: "tenant-a", actions: [" "], resources: ["record:r1"], effect: "ALLOW" },
    { tenantId: "tenant-a", actions: ["READ"], resources: [], effect: "ALLOW" },
    { tenantId: "tenant-a", actions: ["READ"], resources: ["record:r1"], effect: "MAYBE" },
    { tenantId: "tenant-a", principalId: " ", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
  ];
  for (const policy of invalidPolicies) {
    assert.throws(() => service.addPolicy(policy), /AUTHORIZATION_POLICY_INVALID/);
  }
  assert.deepEqual(service.snapshot(), []);
});

test("authorization rejects malformed runtime request fields", () => {
  const service = new InMemoryAuthorizationService();
  for (const request of [
    null,
    { tenantId: "tenant-a", principalId: "user-a", action: " ", resource: "record:r1" },
    { tenantId: "tenant-a", principalId: "user-a", action: "READ", resource: "" },
  ]) {
    assert.throws(() => service.decide(request), /AUTHORIZATION_CONTEXT_REQUIRED/);
  }
});
