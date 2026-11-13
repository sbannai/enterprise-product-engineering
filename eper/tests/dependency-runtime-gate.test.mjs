import test from "node:test";
import assert from "node:assert/strict";
import { assertDependencyRuntimeCompatible } from "../dist/packages/dependencies/runtime-gate.js";

const policy = {
  dependencyId: "vendor.sdk", vendor: "Vendor", componentKind: "sdk",
  supportedVersions: { minimum: "1.0.0", maximum: "3.0.0" },
  supportState: "supported", mandatoryUpdate: false, downgradePolicy: "allowed",
  notice: { verification: "verified", source: "vendor", reference: "notice-1", recordedAt: "2026-11-01T00:00:00Z" },
  version: 1, policyStatus: "active",
};
const row = (scopeType, scopeId, installedVersion = "2.0.0") => ({
  dependencyId: "vendor.sdk", installationId: scopeType + "-1", scopeType, scopeId,
  installedVersion, operatingSystem: "linux", runtime: "node-22",
  installationStatus: "observed", version: 1,
});
const repository = (installations) => ({
  async get() { return policy; },
  async listInstallations() { return installations; },
});

test("shared dependency gate resolves the most specific persisted installation", async () => {
  await assert.rejects(() => assertDependencyRuntimeCompatible({
    repository: repository([
      row("application", "app-1", "2.0.0"),
      row("device", "scanner-1", "4.0.0"),
    ]),
    scope: { tenantId: "tenant-1", applicationId: "app-1", deviceId: "scanner-1" },
    dependencyIds: ["vendor.sdk"], evaluatedAt: "2026-11-13T00:00:00Z",
  }), /DEPENDENCY_RUNTIME_BLOCKED:vendor.sdk:upgrade_required/);
});

test("shared dependency gate fails closed when persisted installation is absent", async () => {
  await assert.rejects(() => assertDependencyRuntimeCompatible({
    repository: repository([]),
    scope: { tenantId: "tenant-1", applicationId: "app-1" },
    dependencyIds: ["vendor.sdk"], evaluatedAt: "2026-11-13T00:00:00Z",
  }), /DEPENDENCY_RUNTIME_INSTALLATION_MISSING/);
});

test("shared dependency gate rejects duplicate declarations", async () => {
  await assert.rejects(() => assertDependencyRuntimeCompatible({
    repository: repository([row("application", "app-1")]),
    scope: { tenantId: "tenant-1", applicationId: "app-1" },
    dependencyIds: ["vendor.sdk", "vendor.sdk"], evaluatedAt: "2026-11-13T00:00:00Z",
  }), /DEPENDENCY_RUNTIME_DECLARATION_INVALID/);
});
