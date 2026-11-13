import test from "node:test";
import assert from "node:assert/strict";
import {
  compareDependencyVersions,
  evaluateDependencyCompatibility,
} from "../dist/packages/dependencies/compatibility.js";

const policy = (overrides = {}) => ({
  dependencyId: "vendor.scanner.sdk",
  vendor: "Example Vendor",
  componentKind: "sdk",
  supportedVersions: { minimum: "2.0.0", maximum: "4.0.0", includeMinimum: true, includeMaximum: true },
  supportState: "supported",
  mandatoryUpdate: false,
  downgradePolicy: "allowed",
  notice: { verification: "verified", source: "vendor bulletin", reference: "VB-42", recordedAt: "2026-11-01T00:00:00Z" },
  ...overrides,
});
const installation = (overrides = {}) => ({
  installedVersion: "3.1.0",
  operatingSystem: "linux",
  runtime: "node-22",
  deviceModel: "scanner-x",
  ...overrides,
});
const evaluate = (p = policy(), i = installation(), at = "2026-11-13T00:00:00Z") =>
  evaluateDependencyCompatibility({ policy: p, installation: i, evaluatedAt: at });

test("compares semantic versions including prerelease precedence and ignores build metadata", () => {
  assert.equal(compareDependencyVersions("1.2.3-alpha.2", "1.2.3-alpha.10"), -1);
  assert.equal(compareDependencyVersions("1.2.3-rc.1", "1.2.3"), -1);
  assert.equal(compareDependencyVersions("1.2.3+build.1", "1.2.3+build.2"), 0);
});

test("accepts an installation within the declared supported range", () => {
  assert.equal(evaluate().status, "compatible");
  assert.equal(evaluate().blocking, false);
});

test("marks a verified mandatory update as required but allows use before its cutoff", () => {
  const result = evaluate(policy({
    mandatoryUpdate: true,
    requiredMinimumVersion: "3.5.0",
    effectiveAt: "2026-12-01T00:00:00Z",
  }));
  assert.equal(result.status, "upgrade_required");
  assert.equal(result.blocking, false);
  assert.equal(result.requiredVersion, "3.5.0");
});

test("blocks an outdated installation at the vendor cutoff", () => {
  const result = evaluate(policy({
    mandatoryUpdate: true,
    requiredMinimumVersion: "3.5.0",
    effectiveAt: "2026-11-10T00:00:00Z",
  }));
  assert.equal(result.status, "blocked_at_cutoff");
  assert.equal(result.blocking, true);
});

test("fails closed when a mandatory notice is missing or unverified", () => {
  for (const verification of ["unverified", "not_provided"]) {
    const result = evaluate(policy({
      mandatoryUpdate: true,
      requiredMinimumVersion: "3.5.0",
      effectiveAt: "2026-12-01T00:00:00Z",
      notice: { verification, source: null, reference: null, recordedAt: null },
    }));
    assert.equal(result.status, "unknown_unverified");
    assert.equal(result.blocking, true);
  }
});

test("rejects unsupported operating system, runtime, and peripheral model combinations", () => {
  assert.equal(evaluate(policy({ compatibleOperatingSystems: ["windows"] })).status, "unsupported_platform");
  assert.equal(evaluate(policy({ compatibleRuntimes: ["node-20"] })).status, "unsupported_platform");
  assert.equal(evaluate(policy({ compatibleDeviceModels: ["scanner-y"] })).status, "unsupported_platform");
});

test("enforces vendor-prohibited downgrade without running an updater", () => {
  const result = evaluate(policy({ downgradePolicy: "vendor_prohibited" }), installation({ proposedVersion: "3.0.0" }));
  assert.equal(result.status, "vendor_no_downgrade");
  assert.equal(result.blocking, true);
});

test("isolates decisions to the evaluated dependency rather than globally disabling capabilities", () => {
  const affected = evaluate(policy({
    dependencyId: "vendor.scanner.sdk",
    mandatoryUpdate: true,
    requiredMinimumVersion: "3.5.0",
    effectiveAt: "2026-11-10T00:00:00Z",
  }));
  const unaffected = evaluate(policy({ dependencyId: "vendor.reporting.sdk" }));
  assert.equal(affected.status, "blocked_at_cutoff");
  assert.equal(unaffected.status, "compatible");
  assert.notEqual(affected.dependencyId, unaffected.dependencyId);
});

test("rejects malformed versions, ranges, and evaluation timestamps", () => {
  assert.throws(() => evaluate(policy(), installation({ installedVersion: "latest" }), "2026-11-13T00:00:00Z"), /DEPENDENCY_COMPATIBILITY_INPUT_INVALID/);
  assert.throws(() => evaluate(policy({ supportedVersions: { minimum: "4.0.0", maximum: "2.0.0" } })), /DEPENDENCY_COMPATIBILITY_INPUT_INVALID/);
  assert.throws(() => evaluate(policy(), installation(), "not-a-date"), /DEPENDENCY_COMPATIBILITY_INPUT_INVALID/);
});

test("a deprecated dependency is marked for upgrade rather than silently accepted", () => {
  assert.equal(evaluate(policy({ supportState: "deprecated" })).status, "upgrade_required");
});


test("rejects incomplete mandatory-update policy instead of silently treating it as optional", () => {
  assert.throws(
    () => evaluate(policy({ mandatoryUpdate: true, requiredMinimumVersion: "3.5.0" })),
    /DEPENDENCY_COMPATIBILITY_INPUT_INVALID/,
  );
  assert.throws(
    () => evaluate(policy({
      mandatoryUpdate: true,
      requiredMinimumVersion: "3.5.0",
      effectiveAt: "2026-12-01T00:00:00Z",
      notice: { verification: "verified", source: null, reference: null, recordedAt: null },
    })),
    /DEPENDENCY_COMPATIBILITY_INPUT_INVALID/,
  );
});

test("fails closed when vendor support state is unknown even if a notice object is marked verified", () => {
  assert.equal(evaluate(policy({ supportState: "unknown" })).status, "unknown_unverified");
});
