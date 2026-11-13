import { assertDependencyRuntimeCompatible, type DependencyInventoryReader } from "./runtime-gate.js";
import type { DependencyInstallationScope } from "./runtime-gate.js";
import type { DependencyScope } from "./postgres-dependency-inventory-repository.js";

export interface CapabilityInvocationScope extends DependencyScope, DependencyInstallationScope {
  actorId: string;
  correlationId: string;
}
export interface DependencyGatedCapabilityInvocation<TInput, TResult> {
  capabilityId: string;
  dependencyIds: readonly string[];
  scope: CapabilityInvocationScope;
  input: TInput;
  evaluatedAt?: string;
}
export interface DependencyGatedCapabilityInvoker {
  invoke<TInput, TResult>(
    invocation: DependencyGatedCapabilityInvocation<TInput, TResult>,
    execute: (input: TInput) => Promise<TResult>,
  ): Promise<TResult>;
}

/**
 * Mandatory execution boundary for dependency-bearing capabilities.
 * The current persisted inventory is checked immediately before handler entry;
 * the handler is never called when policy/installation evidence is absent or blocked.
 */
export function createDependencyGatedCapabilityInvoker(
  repository: DependencyInventoryReader,
  now: () => string = () => new Date().toISOString(),
): DependencyGatedCapabilityInvoker {
  if (!repository || typeof repository.get !== "function" ||
      typeof repository.listInstallations !== "function" || typeof now !== "function") {
    throw new Error("CAPABILITY_DEPENDENCY_INVOKER_CONFIGURATION_INVALID");
  }
  return {
    async invoke<TInput, TResult>(invocation, execute) {
      if (!invocation || typeof invocation.capabilityId !== "string" ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(invocation.capabilityId) ||
          !invocation.scope || typeof invocation.scope.actorId !== "string" ||
          !invocation.scope.actorId.trim() || typeof invocation.scope.correlationId !== "string" ||
          !invocation.scope.correlationId.trim() || typeof execute !== "function") {
        throw new Error("CAPABILITY_DEPENDENCY_INVOCATION_INVALID");
      }
      await assertDependencyRuntimeCompatible({
        repository,
        scope: invocation.scope,
        dependencyIds: invocation.dependencyIds,
        evaluatedAt: invocation.evaluatedAt ?? now(),
        errorPrefix: "CAPABILITY_DEPENDENCY",
      });
      return execute(invocation.input);
    },
  };
}
