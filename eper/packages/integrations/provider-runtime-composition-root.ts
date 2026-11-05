import {
  ProviderRuntimeAdapterRegistry,
  type ProviderRuntimeAdapter,
  type ProviderRuntimeAllowlistEntry,
} from "./provider-runtime-adapter-registry.js";
import {
  ProviderRuntimeCredentialResolver,
  type ProviderRuntimeSecretReferenceStore,
} from "./provider-runtime-credential-resolver.js";
import type { ProviderSecretResolver } from "./provider-connection-validation-service.js";
import {
  createProviderOperationWorkerWithRuntimeRegistry,
  type ProviderOperationWorkerRuntimeDependencies,
} from "./provider-runtime-worker-composition.js";
import type {
  ProviderOperationWorkerDependencies,
  ProviderOperationWorkerOptions,
} from "./provider-operation-worker.js";
import {
  ProviderOperationWorkerHost,
  type ProviderOperationWorkerHostOptions,
  type ProviderQueueWakeSource,
} from "./provider-operation-worker-host.js";

export type ProviderRuntimeCompositionInput = {
  /** Must be explicitly true; undefined/false always leaves the runtime disabled. */
  enabled?: boolean;
  /** Production is opt-in and applies stricter adapter and telemetry requirements. */
  runtimeEnvironment?: "development" | "test" | "production";
  registrations: readonly ProviderRuntimeAdapter[];
  allowlist: readonly ProviderRuntimeAllowlistEntry[];
  secretReferences: ProviderRuntimeSecretReferenceStore;
  secrets: ProviderSecretResolver;
  workerDependencies: Omit<ProviderOperationWorkerDependencies, "dispatch">;
  workerOptions: ProviderOperationWorkerOptions;
  wakeSource: ProviderQueueWakeSource;
  hostOptions?: ProviderOperationWorkerHostOptions;
};

export type ProviderRuntimeComposition = {
  registry: ProviderRuntimeAdapterRegistry;
  credentialResolver: ProviderRuntimeCredentialResolver;
  worker: ReturnType<typeof createProviderOperationWorkerWithRuntimeRegistry>;
  host: ProviderOperationWorkerHost;
};

/**
 * Single fail-closed composition root for the provider runtime.
 * It is inert unless explicitly enabled. Even when enabled, an empty executable
 * adapter set is rejected rather than starting a worker that can never dispatch.
 * Production additionally requires deployment-attested approved adapters,
 * production audit context and bounded telemetry; raw-error callbacks are barred.
 * This factory performs no network calls and starts no background process.
 */
export function createProviderRuntimeComposition(
  input: ProviderRuntimeCompositionInput,
): ProviderRuntimeComposition | null {
  if (input?.enabled !== true) return null;
  if (!Array.isArray(input.registrations) || input.registrations.length === 0
    || !Array.isArray(input.allowlist) || input.allowlist.length === 0) {
    throw new Error("PROVIDER_RUNTIME_EXECUTABLE_ADAPTERS_REQUIRED");
  }
  if (!input.secretReferences || typeof input.secretReferences.getDispatchSecretReference !== "function"
    || typeof input.secrets?.resolve !== "function"
    || !input.wakeSource || typeof input.wakeSource.start !== "function"
    || typeof input.wakeSource.wait !== "function" || typeof input.wakeSource.close !== "function") {
    throw new Error("PROVIDER_RUNTIME_COMPOSITION_DEPENDENCIES_REQUIRED");
  }
  if (input.runtimeEnvironment !== undefined
    && !["development", "test", "production"].includes(input.runtimeEnvironment)) {
    throw new Error("PROVIDER_RUNTIME_ENVIRONMENT_INVALID");
  }
  if (input.runtimeEnvironment === "production") {
    const approved = (entry: { executionClass?: string }) => entry.executionClass === "approved";
    if (input.workerOptions?.auditEnvironment !== "production"
      || !input.registrations.every(approved)
      || !input.allowlist.every(approved)
      || typeof input.hostOptions?.onEvent !== "function"
      || input.hostOptions.onError !== undefined) {
      throw new Error("PROVIDER_RUNTIME_PRODUCTION_GUARDRAILS_REQUIRED");
    }
  }

  const registry = new ProviderRuntimeAdapterRegistry(input.registrations, input.allowlist);
  const credentialResolver = new ProviderRuntimeCredentialResolver(input.secretReferences, input.secrets);
  const workerDependencies: ProviderOperationWorkerRuntimeDependencies = {
    ...input.workerDependencies,
    runtimeRegistry: registry,
    credentialResolver,
  };
  const worker = createProviderOperationWorkerWithRuntimeRegistry(workerDependencies, input.workerOptions);
  const host = new ProviderOperationWorkerHost(worker, input.wakeSource, input.hostOptions);
  return { registry, credentialResolver, worker, host };
}
