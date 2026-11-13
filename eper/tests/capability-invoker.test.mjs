import test from "node:test";
import assert from "node:assert/strict";
import { createDependencyGatedCapabilityInvoker } from "../dist/packages/dependencies/capability-invoker.js";

const policy = {
  dependencyId: "vendor.sdk", vendor: "Vendor", componentKind: "sdk",
  supportedVersions: { minimum: "1.0.0", maximum: "3.0.0" },
  supportState: "supported", mandatoryUpdate: false, downgradePolicy: "allowed",
  notice: { verification: "verified", source: "vendor", reference: "notice-1", recordedAt: "2026-11-01T00:00:00Z" },
  version: 1, policyStatus: "active",
};
const install = {
  dependencyId: "vendor.sdk", installationId: "install-1", scopeType: "application", scopeId: "app-1",
  installedVersion: "2.0.0", operatingSystem: "linux", runtime: "node-22",
  installationStatus: "observed", version: 1,
};
const repo = (rows) => ({ async get() { return policy; }, async listInstallations() { return rows; } });
const invocation = {
  capabilityId: "integration.notify", dependencyIds: ["vendor.sdk"],
  scope: { tenantId: "tenant-1", applicationId: "app-1", actorId: "actor-1", correlationId: "corr-1" },
  input: { message: "hello" }, evaluatedAt: "2026-11-13T00:00:00Z",
};

test("capability handler runs only after persisted dependency compatibility passes", async () => {
  const invoker = createDependencyGatedCapabilityInvoker(repo([install]));
  let called = false;
  const result = await invoker.invoke(invocation, async input => { called = true; return input.message; });
  assert.equal(called, true);
  assert.equal(result, "hello");
});

test("blocked dependency prevents capability handler invocation", async () => {
  const invoker = createDependencyGatedCapabilityInvoker(repo([
    { ...install, installedVersion: "4.0.0" },
  ]));
  let called = false;
  await assert.rejects(() => invoker.invoke(invocation, async () => { called = true; }),
    /CAPABILITY_DEPENDENCY_BLOCKED:vendor.sdk:upgrade_required/);
  assert.equal(called, false);
});

test("dependency-free capability must declare an explicit empty list", async () => {
  const invoker = createDependencyGatedCapabilityInvoker(repo([]));
  const result = await invoker.invoke({ ...invocation, dependencyIds: [] }, async () => "ok");
  assert.equal(result, "ok");
  await assert.rejects(() => invoker.invoke({ ...invocation, dependencyIds: undefined }, async () => "unsafe"),
    /CAPABILITY_DEPENDENCY_DECLARATION_INVALID/);
});
