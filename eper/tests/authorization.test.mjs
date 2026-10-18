import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuthorizationPolicyStore } from "../dist/packages/capabilities/json-file-authorization-policy-store.js";
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


test("JSON-file authorization store matches in-memory policy validation", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-authz-"));
  try {
    const store = new JsonFileAuthorizationPolicyStore(join(directory, "policies.json"));
    const invalidPolicies = [
      null,
      { tenantId: " ", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
      { tenantId: "tenant-a", actions: [" "], resources: ["record:r1"], effect: "ALLOW" },
      { tenantId: "tenant-a", actions: ["READ"], resources: [" "], effect: "ALLOW" },
      { tenantId: "tenant-a", principalId: " ", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
      { tenantId: "tenant-a", actions: ["READ"], resources: ["record:r1"], effect: "MAYBE" },
    ];
    for (const policy of invalidPolicies) {
      assert.throws(() => store.addPolicy(policy), /AUTHORIZATION_POLICY_INVALID/);
    }
    assert.deepEqual(store.snapshot(), []);
    store.addPolicy({ tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" });
    assert.equal(store.decide({ tenantId: "tenant-a", principalId: "user-a", action: "READ", resource: "record:r1" }).effect, "ALLOW");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("in-memory authorization store rejects duplicate policies with the same identity", () => {
  const service = new InMemoryAuthorizationService();
  const policy = { tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" };
  service.addPolicy(policy);
  assert.throws(() => service.addPolicy({ ...policy, actions: ["READ"], resources: ["record:r1"] }), /AUTHORIZATION_POLICY_ALREADY_EXISTS/);
  assert.equal(service.snapshot().length, 1);
  assert.equal(service.decide({ tenantId: "tenant-a", principalId: "user-a", action: "READ", resource: "record:r1" }).effect, "ALLOW");
});

test("JSON-file authorization store rejects duplicate policies without corrupting persisted state", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-authz-duplicate-"));
  try {
    const store = new JsonFileAuthorizationPolicyStore(join(directory, "policies.json"));
    const policy = { tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" };
    store.addPolicy(policy);
    assert.throws(() => store.addPolicy(policy), /AUTHORIZATION_POLICY_ALREADY_EXISTS/);
    assert.equal(store.snapshot().length, 1);
    assert.equal(store.decide({ tenantId: "tenant-a", principalId: "user-a", action: "READ", resource: "record:r1" }).effect, "ALLOW");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("authorization rejects duplicate action and resource entries before mutation in both adapters", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-authz-duplicate-members-"));
  try {
    const stores = [
      new InMemoryAuthorizationService(),
      new JsonFileAuthorizationPolicyStore(join(directory, "policies.json")),
    ];
    const invalid = [
      { tenantId: "tenant-a", principalId: "user-a", actions: ["READ", "READ"], resources: ["record:r1"], effect: "ALLOW" },
      { tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1", "record:r1"], effect: "ALLOW" },
    ];
    for (const store of stores) {
      for (const policy of invalid) assert.throws(() => store.addPolicy(policy), /AUTHORIZATION_POLICY_INVALID/);
      assert.deepEqual(store.snapshot(), []);
      store.addPolicy({ tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" });
      assert.equal(store.snapshot().length, 1);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("authorization decision and request-validation behavior matches across adapters", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-authz-decision-parity-"));
  try {
    const stores = [
      new InMemoryAuthorizationService(),
      new JsonFileAuthorizationPolicyStore(join(directory, "policies.json")),
    ];
    const policies = [
      { tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
      { tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "DENY" },
      { tenantId: "tenant-b", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
    ];
    const requests = [
      [{ tenantId: "tenant-a", principalId: "user-a", action: "READ", resource: "record:r1" }, "DENY", "EXPLICIT_DENY_POLICY"],
      [{ tenantId: "tenant-a", principalId: "user-a", action: "WRITE", resource: "record:r1" }, "DENY", "NO_ALLOW_POLICY"],
      [{ tenantId: "tenant-b", principalId: "user-z", action: "READ", resource: "record:r1" }, "ALLOW", "ALLOW_POLICY_MATCH"],
      [{ tenantId: "tenant-c", principalId: "user-a", action: "READ", resource: "record:r1" }, "DENY", "NO_ALLOW_POLICY"],
    ];
    for (const store of stores) {
      for (const policy of policies) store.addPolicy(policy);
      for (const [request, effect, reason] of requests) {
        const decision = store.decide(request);
        assert.equal(decision.effect, effect);
        assert.equal(decision.reason, reason);
      }
      for (const request of [null, { tenantId: " ", principalId: "user-a", action: "READ", resource: "record:r1" }]) {
        assert.throws(() => store.decide(request), /AUTHORIZATION_CONTEXT_REQUIRED/);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file authorization store rejects malformed persisted policies on read", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-authz-corrupt-"));
  const file = join(directory, "policies.json");
  try {
    writeFileSync(file, JSON.stringify([
      { tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
      { tenantId: "tenant-a", principalId: "user-b", actions: [" "], resources: ["record:r2"], effect: "ALLOW" },
    ]));
    const store = new JsonFileAuthorizationPolicyStore(file);
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);
    assert.throws(() => store.decide({ tenantId: "tenant-a", principalId: "user-a", action: "READ", resource: "record:r1" }), /PERSISTENCE_DATA_INVALID/);

    writeFileSync(file, JSON.stringify([
      { tenantId: "tenant-a", principalId: "user-a", actions: ["READ", "READ"], resources: ["record:r1"], effect: "ALLOW" },
    ]));
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);

    writeFileSync(file, JSON.stringify([
      { tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
      { tenantId: "tenant-a", principalId: "user-a", actions: ["READ"], resources: ["record:r1"], effect: "ALLOW" },
    ]));
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
