import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuthorizationPolicyStore } from "../dist/packages/capabilities/json-file-authorization-policy-store.js";

function withStore(run) {
  const directory = mkdtempSync(join(tmpdir(), "eper-auth-policy-store-"));
  const filePath = join(directory, "policies.json");
  try { run(new JsonFileAuthorizationPolicyStore(filePath), filePath); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

const policy = {
  tenantId: "tenant-a",
  principalId: "user-a",
  actions: ["READ"],
  resources: ["record:r1"],
  effect: "ALLOW",
};

test("JSON authorization store rejects malformed policies without persisting them", () => {
  withStore(store => {
    assert.throws(() => store.addPolicy(null), /AUTHORIZATION_POLICY_INVALID/);
    assert.throws(() => store.addPolicy({ ...policy, tenantId: 9 }), /AUTHORIZATION_POLICY_INVALID/);
    assert.throws(() => store.addPolicy({ ...policy, principalId: " " }), /AUTHORIZATION_POLICY_INVALID/);
    assert.throws(() => store.addPolicy({ ...policy, actions: [" "] }), /AUTHORIZATION_POLICY_INVALID/);
    assert.throws(() => store.addPolicy({ ...policy, resources: [null] }), /AUTHORIZATION_POLICY_INVALID/);
    assert.throws(() => store.addPolicy({ ...policy, effect: "MAYBE" }), /AUTHORIZATION_POLICY_INVALID/);
    assert.equal(store.snapshot().length, 0);
  });
});

test("JSON authorization store enforces deny precedence and tenant isolation", () => {
  withStore(store => {
    store.addPolicy(policy);
    store.addPolicy({ ...policy, effect: "DENY" });
    store.addPolicy({ ...policy, tenantId: "tenant-b", principalId: "user-b" });
    assert.equal(store.decide({
      tenantId: "tenant-a", principalId: "user-a", action: "READ", resource: "record:r1",
    }).effect, "DENY");
    assert.equal(store.decide({
      tenantId: "tenant-b", principalId: "user-b", action: "READ", resource: "record:r1",
    }).effect, "ALLOW");
    assert.equal(store.decide({
      tenantId: "tenant-c", principalId: "user-c", action: "READ", resource: "record:r1",
    }).effect, "DENY");
  });
});

test("JSON authorization store rejects malformed persisted policy rows", () => {
  withStore((store, filePath) => {
    writeFileSync(filePath, JSON.stringify([
      { ...policy, actions: ["READ", " "] },
    ]));
    assert.throws(() => store.snapshot(), /PERSISTENCE_DATA_INVALID/);
    assert.throws(() => store.decide({
      tenantId: "tenant-a", principalId: "user-a", action: "READ", resource: "record:r1",
    }), /PERSISTENCE_DATA_INVALID/);
  });
});

test("JSON authorization store deep-clones policy arrays and exposes stable JSON", () => {
  withStore(store => {
    const input = { ...policy, actions: ["READ"], resources: ["record:r1"] };
    store.addPolicy(input);
    input.actions.push("WRITE");
    const snapshot = store.snapshot();
    snapshot[0].resources.push("record:r2");
    assert.deepEqual(store.snapshot(), [policy]);
  });
});
