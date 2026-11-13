import type { ProviderDefinition, PostgresProviderCatalogueRepository } from "./postgres-provider-catalogue-repository.js";
import type { ProviderDispatchConfigurationService, ProviderDispatchSelection } from "./provider-dispatch-configuration-service.js";
import type { ProviderRuntimeAdapterRegistry } from "./provider-runtime-adapter-registry.js";
import { assertProviderRuntimeDeploymentAllowed, type ProviderRuntimeDeploymentPolicy } from "./provider-runtime-deployment-policy.js";

export type ResolvedProviderRuntime<TAdapter> = {
  selection: ProviderDispatchSelection;
  definitionVersion: number;
  adapterKey: string;
  adapterVersion: string;
  capability: string;
  adapter: TAdapter;
};

export class ProviderRuntimeResolutionError extends Error {
  constructor(readonly code:
    | "PROVIDER_RUNTIME_DEFINITION_NOT_FOUND"
    | "PROVIDER_RUNTIME_DEFINITION_INACTIVE"
    | "PROVIDER_RUNTIME_CATALOGUE_CAPABILITY_MISMATCH") {
    super(code);
    this.name = "ProviderRuntimeResolutionError";
  }
}

/**
 * Resolves a live tenant/application binding and effective policy first, then
 * re-reads the current provider definition and resolves its exact executable
 * adapter version. No credentials or provider calls occur in this service.
 */
export class ProviderRuntimeResolutionService<TAdapter> {
  constructor(
    private readonly dispatch: Pick<ProviderDispatchConfigurationService, "resolve">,
    private readonly catalogue: Pick<PostgresProviderCatalogueRepository, "get">,
    private readonly adapters: Pick<ProviderRuntimeAdapterRegistry<TAdapter>, "resolve">,
    private readonly deploymentPolicy?: ProviderRuntimeDeploymentPolicy,
  ) {}

  async resolve(input: {
    tenantId: string;
    applicationId: string;
    capability: string;
    expectedConnectionId?: string;
  }): Promise<ResolvedProviderRuntime<TAdapter>> {
    const selection = await this.dispatch.resolve({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      capabilityKey: input.capability,
      ...(input.expectedConnectionId !== undefined ? { expectedConnectionId: input.expectedConnectionId } : {}),
    });
    const definition: ProviderDefinition | null = await this.catalogue.get(selection.providerKey);
    if (!definition) throw new ProviderRuntimeResolutionError("PROVIDER_RUNTIME_DEFINITION_NOT_FOUND");
    if (definition.status !== "ACTIVE") {
      throw new ProviderRuntimeResolutionError("PROVIDER_RUNTIME_DEFINITION_INACTIVE");
    }
    if (!definition.capabilities.includes(input.capability)) {
      throw new ProviderRuntimeResolutionError("PROVIDER_RUNTIME_CATALOGUE_CAPABILITY_MISMATCH");
    }
    // The deployment-owned trust policy is enforced before the executable adapter
    // is resolved. Endpoint is server-owned connection policy, never request data.
    if (this.deploymentPolicy?.enabled) {
      const endpoint = selection.policy.endpoint;
      if (typeof endpoint !== "string") {
        throw new Error("PROVIDER_RUNTIME_ENDPOINT_NOT_ALLOWED");
      }
      const admitted = this.deploymentPolicy.adapters.find(item =>
        item.adapterKey === definition.adapterKey && item.adapterVersion === definition.adapterVersion &&
        item.capabilities.includes(input.capability));
      assertProviderRuntimeDeploymentAllowed(this.deploymentPolicy, {
        providerKey: selection.providerKey,
        adapterKey: definition.adapterKey,
        adapterVersion: definition.adapterVersion,
        capability: input.capability,
        endpoint,
        tlsMode: typeof selection.policy.tlsMode === "string" ? selection.policy.tlsMode : "",
        synthetic: admitted?.synthetic ?? false,
      });
    } else if (this.deploymentPolicy && !this.deploymentPolicy.enabled) {
      throw new Error("PROVIDER_RUNTIME_PROVIDER_NOT_ALLOWED");
    }
    const adapter = this.adapters.resolve({
      adapterKey: definition.adapterKey,
      adapterVersion: definition.adapterVersion,
      capability: input.capability,
    });
    return {
      selection,
      definitionVersion: definition.version,
      adapterKey: definition.adapterKey,
      adapterVersion: definition.adapterVersion,
      capability: input.capability,
      adapter,
    };
  }
}
