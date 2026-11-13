import { evaluateDependencyCompatibility } from "./compatibility.js";
import type { DependencyPolicy } from "./compatibility.js";
import type { DependencyScope, StoredDependencyInstallation, StoredDependencyPolicy } from "./postgres-dependency-inventory-repository.js";

export interface DependencyInventoryReader {
  get(scope: DependencyScope, dependencyId: string): Promise<StoredDependencyPolicy | null>;
  listInstallations(scope: DependencyScope): Promise<StoredDependencyInstallation[]>;
}
export interface DependencyInstallationScope {
  deviceId?: string;
  workstationId?: string;
  userId?: string;
  gatewayId?: string;
}
export interface AssertDependencyRuntimeCompatibleInput {
  repository: DependencyInventoryReader;
  scope: DependencyScope & DependencyInstallationScope;
  dependencyIds: readonly string[];
  evaluatedAt: string;
  errorPrefix?: string;
}

/**
 * Resolve authoritative persisted policy and installation state at the point of
 * use. Static capability/adapter snapshots are intentionally not accepted.
 * Scope precedence is device, workstation, user, gateway, then application.
 */
export async function assertDependencyRuntimeCompatible(
  input: AssertDependencyRuntimeCompatibleInput,
): Promise<void> {
  if (!input || !input.repository || !Array.isArray(input.dependencyIds) ||
      !Number.isFinite(Date.parse(input.evaluatedAt))) {
    throw new Error("DEPENDENCY_RUNTIME_GATE_INPUT_INVALID");
  }
  const prefix = input.errorPrefix ?? "DEPENDENCY_RUNTIME";
  const scope = { tenantId: input.scope.tenantId, applicationId: input.scope.applicationId };
  const ids = [...input.dependencyIds];
  if (ids.some(id => typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) ||
      new Set(ids).size !== ids.length) {
    throw new Error(prefix + "_DECLARATION_INVALID");
  }
  if (ids.length === 0) return;
  const [policies, installations] = await Promise.all([
    Promise.all(ids.map(id => input.repository.get(scope, id))),
    input.repository.listInstallations(scope),
  ]);
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    const policy = policies[index];
    if (!policy || policy.policyStatus !== "active") {
      throw new Error(prefix + "_POLICY_UNAVAILABLE:" + id);
    }
    const candidates = installations.filter(row =>
      row.dependencyId === id && row.installationStatus !== "retired");
    const selectors = [
      ["device", input.scope.deviceId],
      ["workstation", input.scope.workstationId],
      ["user", input.scope.userId],
      ["gateway", input.scope.gatewayId],
      ["application", input.scope.applicationId],
    ] as const;
    let selected: StoredDependencyInstallation | undefined;
    for (const [type, scopeId] of selectors) {
      if (!scopeId) continue;
      const matches = candidates.filter(row => row.scopeType === type && row.scopeId === scopeId);
      if (matches.length > 1) throw new Error(prefix + "_INSTALLATION_AMBIGUOUS:" + id + ":" + type);
      if (matches.length === 1) { selected = matches[0]; break; }
    }
    if (!selected) throw new Error(prefix + "_INSTALLATION_MISSING:" + id);
    if (selected.installationStatus === "blocked" || selected.installationStatus === "upgrade_pending") {
      throw new Error(prefix + "_INSTALLATION_NOT_READY:" + id);
    }
    const decision = evaluateDependencyCompatibility({
      policy: policy as DependencyPolicy,
      installation: {
        installedVersion: selected.installedVersion,
        operatingSystem: selected.operatingSystem,
        runtime: selected.runtime,
        deviceModel: selected.deviceModel,
      },
      evaluatedAt: input.evaluatedAt,
    });
    if (decision.blocking) throw new Error(prefix + "_BLOCKED:" + id + ":" + decision.status);
  }
}
