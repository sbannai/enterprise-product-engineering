import type {
  ApplicationProviderConnection,
  PostgresProviderConnectionRepository,
} from "./postgres-provider-connection-repository.js";
import type {
  EffectiveProviderPolicy,
  PostgresTenantProviderDefaultsRepository,
} from "./postgres-tenant-provider-defaults-repository.js";

export type ProviderDispatchSelection = {
  tenantId: string;
  applicationId: string;
  capabilityKey: string;
  connectionId: string;
  providerKey: string;
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
    | "PROVIDER_DISPATCH_POLICY_SCOPE_MISMATCH") {
    super(code);
    this.name = "ProviderDispatchConfigurationError";
  }
}

const sensitivePolicyKey = /(password|passwd|secret|token|authorization|cookie|api[_-]?key|client[_-]?secret|credential|private[_-]?key)/i;

function containsSensitivePolicyKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitivePolicyKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => sensitivePolicyKey.test(key) || containsSensitivePolicyKey(nested),
  );
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
    const effective = await this.policies.resolveEffectivePolicy({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      connectionId: selected.connectionId,
    });
    if (effective.tenantId !== input.tenantId ||
        effective.applicationId !== input.applicationId ||
        effective.connectionId !== selected.connectionId) {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_POLICY_SCOPE_MISMATCH");
    }
    if ((effective.source !== "APPLICATION_OVERRIDE" && effective.source !== "TENANT_DEFAULT") ||
        !effective.policy || typeof effective.policy !== "object" || Array.isArray(effective.policy) ||
        containsSensitivePolicyKey(effective.policy) ||
        !(effective.tenantDefaultVersion === null ||
          (Number.isSafeInteger(effective.tenantDefaultVersion) && effective.tenantDefaultVersion >= 1)) ||
        (effective.source === "TENANT_DEFAULT" && effective.tenantDefaultVersion === null)) {
      throw new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_POLICY_INVALID");
    }

    return {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      capabilityKey: input.capabilityKey,
      connectionId: selected.connectionId,
      providerKey: selected.providerKey,
      connectionVersion: selected.version,
      policy: effective.policy,
      policySource: effective.source,
      tenantDefaultVersion: effective.tenantDefaultVersion,
    };
  }
}
