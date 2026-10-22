import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuthorizationService } from "../dist/packages/capabilities/authorization.js";

const baseRequest = {
  tenantId: "tenant-a",
  principalId: "user-a",
  action: "application.read",
  resource: "app-a",
};

test("authorization denies by default when no policy matches", () => {
  const service = new InMemoryAuthorizationService();
  assert.deepEqual(service.decide(baseRequest), {
    effect: "DENY",
    reason: "NO_ALLOW_POLICY",
    request: baseRequest,
  });
});

test("an exact matching allow policy grants only the declared action and resource", () => {
  const service = new InMemoryAuthorizationService([{
    tenantId: "tenant-a",
    principalId: "user-a",
    actions: ["application.read"],
    resources: ["app-a"],
    effect: "ALLOW",
  }]);

  assert.equal(service.decide(baseRequest).effect, "ALLOW");
  assert.equal(service.decide({ ...baseRequest, action: "application.delete" }).effect, "DENY");
  assert.equal(service.decide({ ...baseRequest, resource: "app-b" }).effect, "DENY");
});

test("explicit deny takes precedence over an otherwise matching allow", () => {
  const service = new InMemoryAuthorizationService([
    {
      tenantId: "tenant-a",
      principalId: "user-a",
      actions: ["application.read"],
      resources: ["app-a"],
      effect: "ALLOW",
    },
    {
      tenantId: "tenant-a",
      principalId: "user-a",
      actions: ["application.read"],
      resources: ["app-a"],
      effect: "DENY",
    },
  ]);

  assert.equal(service.decide(baseRequest).effect, "DENY");
  assert.equal(service.decide(baseRequest).reason, "EXPLICIT_DENY_POLICY");
});

test("a policy for one tenant never grants access in another tenant", () => {
  const service = new InMemoryAuthorizationService([{
    tenantId: "tenant-a",
    principalId: "user-a",
    actions: ["application.read"],
    resources: ["app-a"],
    effect: "ALLOW",
  }]);

  assert.equal(service.decide({ ...baseRequest, tenantId: "tenant-b" }).effect, "DENY");
  assert.equal(service.decide({ ...baseRequest, principalId: "user-b" }).effect, "DENY");
});

test("authorization rejects incomplete request context", () => {
  const service = new InMemoryAuthorizationService();
  assert.throws(
    () => service.decide({ ...baseRequest, principalId: "" }),
    { message: "AUTHORIZATION_CONTEXT_REQUIRED" },
  );
});

test("policy snapshots do not expose mutable internal action/resource arrays", () => {
  const service = new InMemoryAuthorizationService([{
    tenantId: "tenant-a",
    principalId: "user-a",
    actions: ["application.read"],
    resources: ["app-a"],
    effect: "ALLOW",
  }]);

  const snapshot = service.snapshot();
  assert.ok(Array.isArray(snapshot));
  const first = snapshot[0];
  assert.ok(first);
  first.actions.push("application.delete");
  first.resources.push("app-b");

  assert.equal(service.decide({ ...baseRequest, action: "application.delete" }).effect, "DENY");
  assert.equal(service.decide({ ...baseRequest, resource: "app-b" }).effect, "DENY");
});
