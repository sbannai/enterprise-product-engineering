export type DependencyComponentKind =
  | "plugin" | "dll" | "sdk" | "driver" | "firmware" | "gateway_agent" | "peripheral_adapter" | "runtime" | "other";

export type DependencySupportState = "supported" | "deprecated" | "unsupported" | "unknown";
export type DependencyNoticeVerification = "verified" | "unverified" | "not_provided";
export type DependencyDowngradePolicy = "allowed" | "vendor_prohibited";

export interface DependencyVersionRange {
  readonly minimum?: string;
  readonly maximum?: string;
  readonly includeMinimum?: boolean;
  readonly includeMaximum?: boolean;
}

export interface DependencyNoticeEvidence {
  readonly verification: DependencyNoticeVerification;
  readonly source: string | null;
  readonly reference: string | null;
  readonly recordedAt: string | null;
}

export interface DependencyPolicy {
  readonly dependencyId: string;
  readonly vendor: string;
  readonly componentKind: DependencyComponentKind;
  readonly supportedVersions: DependencyVersionRange;
  readonly requiredMinimumVersion?: string;
  readonly supportState: DependencySupportState;
  readonly mandatoryUpdate: boolean;
  readonly effectiveAt?: string;
  readonly downgradePolicy: DependencyDowngradePolicy;
  readonly notice: DependencyNoticeEvidence;
  readonly compatibleOperatingSystems?: readonly string[];
  readonly compatibleRuntimes?: readonly string[];
  readonly compatibleDeviceModels?: readonly string[];
}

export interface DependencyInstallation {
  readonly installedVersion: string;
  readonly operatingSystem: string;
  readonly runtime: string;
  readonly deviceModel?: string;
  readonly proposedVersion?: string;
}

export type DependencyCompatibilityStatus =
  | "compatible"
  | "upgrade_required"
  | "blocked_at_cutoff"
  | "unsupported_platform"
  | "unknown_unverified"
  | "vendor_no_downgrade"
  | "unsupported_dependency";

export interface DependencyCompatibilityDecision {
  readonly dependencyId: string;
  readonly status: DependencyCompatibilityStatus;
  readonly compatible: boolean;
  readonly blocking: boolean;
  readonly reason: string;
  readonly requiredVersion?: string;
  readonly effectiveAt?: string;
}

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?$/;

function parseVersion(value: string): ParsedVersion | null {
  const match = SEMVER.exec(value);
  if (!match) return null;
  const prerelease = match[4] ? match[4].split(".") : [];
  if (prerelease.some(part => !part || (/^0\d+$/.test(part)))) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: prerelease.map(part => /^\d+$/.test(part) ? Number(part) : part),
  };
}

/** Compare strict SemVer 2.0 versions. Build metadata does not affect precedence. */
export function compareDependencyVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error("DEPENDENCY_VERSION_INVALID");
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    const av = a.prerelease[i];
    const bv = b.prerelease[i];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av === bv) continue;
    if (typeof av === "number" && typeof bv === "number") return av < bv ? -1 : 1;
    if (typeof av === "number") return -1;
    if (typeof bv === "number") return 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

function validRange(range: DependencyVersionRange): boolean {
  if (range.minimum && !parseVersion(range.minimum)) return false;
  if (range.maximum && !parseVersion(range.maximum)) return false;
  if (range.minimum && range.maximum) {
    const comparison = compareDependencyVersions(range.minimum, range.maximum);
    if (comparison > 0) return false;
    if (comparison === 0 && range.includeMinimum === false && range.includeMaximum === false) return false;
  }
  return true;
}

function withinRange(version: string, range: DependencyVersionRange): boolean {
  if (range.minimum) {
    const comparison = compareDependencyVersions(version, range.minimum);
    if (comparison < 0 || (comparison === 0 && range.includeMinimum === false)) return false;
  }
  if (range.maximum) {
    const comparison = compareDependencyVersions(version, range.maximum);
    if (comparison > 0 || (comparison === 0 && range.includeMaximum === false)) return false;
  }
  return true;
}

function decision(
  policy: DependencyPolicy,
  status: DependencyCompatibilityStatus,
  reason: string,
  blocking: boolean,
  extra: Pick<DependencyCompatibilityDecision, "requiredVersion" | "effectiveAt"> = {},
): DependencyCompatibilityDecision {
  return {
    dependencyId: policy.dependencyId,
    status,
    compatible: status === "compatible",
    blocking,
    reason,
    ...extra,
  };
}

/**
 * Deterministic, side-effect-free compatibility evaluation. It does not fetch
 * vendor notices, install packages, execute binaries, or mutate device state.
 * Callers supply a trusted clock value and verified policy evidence.
 */
export function evaluateDependencyCompatibility(input: {
  policy: DependencyPolicy;
  installation: DependencyInstallation;
  evaluatedAt: string;
}): DependencyCompatibilityDecision {
  const { policy, installation } = input;
  const evaluatedAt = Date.parse(input.evaluatedAt);
  if (!policy.dependencyId || !policy.vendor || !Number.isFinite(evaluatedAt) ||
      !validRange(policy.supportedVersions) ||
      !parseVersion(installation.installedVersion) ||
      (installation.proposedVersion !== undefined && !parseVersion(installation.proposedVersion)) ||
      (policy.requiredMinimumVersion !== undefined && !parseVersion(policy.requiredMinimumVersion)) ||
      (policy.effectiveAt !== undefined && !Number.isFinite(Date.parse(policy.effectiveAt)))) {
    throw new Error("DEPENDENCY_COMPATIBILITY_INPUT_INVALID");
  }

  if (policy.downgradePolicy === "vendor_prohibited" && installation.proposedVersion &&
      compareDependencyVersions(installation.proposedVersion, installation.installedVersion) < 0) {
    return decision(policy, "vendor_no_downgrade", "The vendor prohibits downgrading this dependency.", true);
  }

  if (policy.notice.verification !== "verified" &&
      (policy.mandatoryUpdate || policy.supportState === "unknown" || policy.supportState === "unsupported")) {
    return decision(policy, "unknown_unverified", "Vendor support or mandatory-update evidence is not verified.", true);
  }

  if (policy.supportState === "unsupported") {
    return decision(policy, "unsupported_dependency", "The vendor no longer supports this dependency.", true);
  }

  const platformCompatible =
    (!policy.compatibleOperatingSystems?.length || policy.compatibleOperatingSystems.includes(installation.operatingSystem)) &&
    (!policy.compatibleRuntimes?.length || policy.compatibleRuntimes.includes(installation.runtime)) &&
    (!policy.compatibleDeviceModels?.length || (!!installation.deviceModel && policy.compatibleDeviceModels.includes(installation.deviceModel)));
  if (!platformCompatible) {
    return decision(policy, "unsupported_platform", "The dependency is not compatible with this operating system, runtime, or device model.", true);
  }

  const required = policy.requiredMinimumVersion;
  const belowRequired = !!required && compareDependencyVersions(installation.installedVersion, required) < 0;
  const outsideRange = !withinRange(installation.installedVersion, policy.supportedVersions);
  if (policy.mandatoryUpdate && belowRequired) {
    const cutoffReached = !!policy.effectiveAt && evaluatedAt >= Date.parse(policy.effectiveAt);
    return decision(
      policy,
      cutoffReached ? "blocked_at_cutoff" : "upgrade_required",
      cutoffReached
        ? "The vendor-mandated minimum version is effective; this dependency must not be activated or invoked."
        : "A verified vendor-mandated update is required before the effective deadline.",
      cutoffReached,
      { requiredVersion: required, effectiveAt: policy.effectiveAt },
    );
  }

  if (outsideRange || policy.supportState === "deprecated" || belowRequired) {
    return decision(
      policy,
      "upgrade_required",
      "The installed dependency version is outside the supported policy or is deprecated.",
      true,
      { requiredVersion: required },
    );
  }

  return decision(policy, "compatible", "The installed dependency satisfies the declared version and platform policy.", false);
}
