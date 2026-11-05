import {
  ProviderOperationWorker,
  type ProviderOperationWorkerDependencies,
  type ProviderOperationWorkerOptions,
} from "./provider-operation-worker.js";
import {
  ProviderRuntimeAdapterRegistry,
} from "./provider-runtime-adapter-registry.js";
import type { ProviderRuntimeCredentialResolver } from "./provider-runtime-credential-resolver.js";

/**
 * Production composition seam for provider operation dispatch.
 *
 * The caller must supply an explicit runtime registry. An empty registry is
 * valid and deliberately parks operations as NEEDS_ATTENTION; this factory
 * never discovers adapters, resolves credentials, loads SDKs or performs
 * external actions by itself.
 */
export type ProviderOperationWorkerRuntimeDependencies =
  Omit<ProviderOperationWorkerDependencies, "dispatch"> & {
    runtimeRegistry: Pick<ProviderRuntimeAdapterRegistry, "dispatch">;
    credentialResolver: Pick<ProviderRuntimeCredentialResolver, "resolve">;
  };

export function createProviderOperationWorkerWithRuntimeRegistry(
  dependencies: ProviderOperationWorkerRuntimeDependencies,
  options: ProviderOperationWorkerOptions,
): ProviderOperationWorker {
  const registry = dependencies?.runtimeRegistry;
  if (!registry || typeof registry.dispatch !== "function") {
    throw new Error("PROVIDER_RUNTIME_REGISTRY_REQUIRED");
  }
  if (!dependencies.credentialResolver || typeof dependencies.credentialResolver.resolve !== "function") {
    throw new Error("PROVIDER_RUNTIME_CREDENTIAL_RESOLVER_REQUIRED");
  }

  const { runtimeRegistry: _runtimeRegistry, credentialResolver, ...workerDependencies } = dependencies;
  return new ProviderOperationWorker({
    ...workerDependencies,
    dispatch: async input => {
      const credentials = await credentialResolver.resolve(input.selection);
      return registry.dispatch({
      credentials,
      selection: {
        providerKey: input.selection.providerKey,
        adapterKey: input.selection.adapterKey,
        adapterVersion: input.selection.adapterVersion,
        capabilityKey: input.selection.capabilityKey,
      },
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      signal: input.signal,
      });
    },
  }, options);
}
