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
