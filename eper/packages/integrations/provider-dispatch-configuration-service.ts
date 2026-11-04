import type {
  ApplicationProviderConnection,
  PostgresProviderConnectionRepository,
} from "./postgres-provider-connection-repository.js";
import type {
  EffectiveProviderPolicy,
  PostgresTenantProviderDefaultsRepository,
} from "./postgres-tenant-provider-defaults-repository.js";
import type {
  ProviderDefinition,
  PostgresProviderCatalogueRepository,
} from "./postgres-provider-catalogue-repository.js";

export type ProviderDispatchSelection = {
  tenantId: string;
  applicationId: string;
  capabilityKey: string;
  connectionId: string;
  providerKey: string;
  adapterKey: string;
  adapterVersion: string;
  connectionVersion: number;
  policy: Record<string, unknown>;
  policySource: EffectiveProviderPolicy["source"];
  tenantDefaultVersion: number | null;
};

export class ProviderDispatchConfigurationError extends Error {
  constructor(readonly code:
    | "PROVIDER_DISPATCH_NO_ACTIVE_BINDING"
    | "PROVIDER_DISPATCH_AMBIGUOUS_BINDING"
    | "PROVIDER_DISPATCH_POLICY_INVALID"
    | "PROVIDER_DISPATCH_CATALOGUE_UNAVAILABLE"
    | "PROVIDER_DISPATCH_CATALOGUE_INACTIVE"
    | "PROVIDER_DISPATCH_CAPABILITY_UNSUPPORTED") {
    super(code);
    this.name = "ProviderDispatchConfigurationError";
  }
}

function eligible(connection: ApplicationProviderConnection, capabilityKey: string): boolean {
  return connection.status === "ACTIVE"
    && connection.bindingStatus === "ACTIVE"
    && connection.allowedCapabilities.includes(capabilityKey);
}

/**
 * Resolves the safe, effective provider configuration immediately before a
 * capability adapter is invoked. This is a routing decision only: secret
 * references and credential values are intentionally excluded.
 */
export class ProviderDispatchConfigurationService {
  constructor(
    private readonly connections: Pick<PostgresProviderConnectionRepository, "listForApplication">,
    private readonly policies: Pick<PostgresTenantProviderDefaultsRepository, "resolveEffectivePolicy">,
    private readonly catalogue: Pick<PostgresProviderCatalogueRepository, "get">,
  ) {}

  async resolve(input: {
    tenantId: string;
    applicationId: string;
    capabilityKey: string;
  }): Promise<ProviderDispatchSelection> {
    const identifiers = [
      ["TENANT", input.tenantId],
      ["APPLICATION", input.applicationId],
      ["CAPABILITY", input.capabilityKey],
    ] as const;
    for (const [label, value] of identifiers) {
      if (typeof value !== "string" || !value.trim() || value.length > 128) {
        throw new Error("PROVIDER_DISPATCH_" + label + "_INVALID");
      }
    }

    const connections = await this.connections.listForApplication(input.tenantId, input.applicationId);
    const candidates = connections.filter(connection => eligible(connection, input.capabilityKey));
    if (candidates.length === 0) {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_NO_ACTIVE_BINDING");
    }
    if (candidates.length > 1) {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_AMBIGUOUS_BINDING");
    }

    const selected = candidates[0];
    const definition: ProviderDefinition | null = await this.catalogue.get(selected.providerKey);
    if (!definition) {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_CATALOGUE_UNAVAILABLE");
    }
    if (definition.status !== "ACTIVE") {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_CATALOGUE_INACTIVE");
    }
    if (typeof definition.adapterKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(definition.adapterKey)
      || typeof definition.adapterVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(definition.adapterVersion)) {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_CATALOGUE_INVALID");
    }
    if (!definition.capabilities.includes(input.capabilityKey)) {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_CAPABILITY_UNSUPPORTED");
    }

    const effective = await this.policies.resolveEffectivePolicy({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      connectionId: selected.connectionId,
    });
    if (effective.source === "NONE" || !effective.policy || typeof effective.policy !== "object" || Array.isArray(effective.policy)) {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_POLICY_INVALID");
    }

    return {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      capabilityKey: input.capabilityKey,
      connectionId: selected.connectionId,
      providerKey: selected.providerKey,
      adapterKey: definition.adapterKey,
      adapterVersion: definition.adapterVersion,
      connectionVersion: selected.version,
      policy: effective.policy,
      policySource: effective.source,
      tenantDefaultVersion: effective.tenantDefaultVersion,
    };
  }
}
