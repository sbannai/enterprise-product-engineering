import type { ProviderRuntimeResolutionService, ResolvedProviderRuntime } from "./provider-runtime-resolution-service.js";
import type { PostgresProviderConnectionRepository } from "./postgres-provider-connection-repository.js";
import type { ProviderCredentialResolutionService } from "./provider-credential-resolution-service.js";

export type ProviderRuntimeWithCredentials<TAdapter, TCredentials> = {
  runtime: ResolvedProviderRuntime<TAdapter>;
  credentials: TCredentials;
};

/**
 * Trusted server-side composition boundary: revalidate the selected tenant /
 * application binding and connection version, fetch its opaque secret reference,
 * then resolve credentials. Nothing in this result is suitable for API responses,
 * logs, audit payloads or persistence.
 */
export class ProviderRuntimeCredentialResolutionService<TAdapter, TCredentials> {
  constructor(
    private readonly runtime: Pick<ProviderRuntimeResolutionService<TAdapter>, "resolve">,
    private readonly connections: Pick<PostgresProviderConnectionRepository, "getRuntimeSecretReference">,
    private readonly secrets: Pick<ProviderCredentialResolutionService<TCredentials>, "resolve">,
  ) {}

  async resolve(input: {
    tenantId: string;
    applicationId: string;
    capability: string;
  }): Promise<ProviderRuntimeWithCredentials<TAdapter, TCredentials>> {
    const runtime = await this.runtime.resolve(input);
    const connection = await this.connections.getRuntimeSecretReference({
      tenantId: runtime.selection.tenantId,
      applicationId: runtime.selection.applicationId,
      connectionId: runtime.selection.connectionId,
      expectedVersion: runtime.selection.connectionVersion,
      providerKey: runtime.selection.providerKey,
      capability: runtime.selection.capabilityKey,
    });
    const credentials = await this.secrets.resolve({
      secretReference: connection.secretReference,
      context: {
        tenantId: runtime.selection.tenantId,
        applicationId: runtime.selection.applicationId,
        connectionId: runtime.selection.connectionId,
        providerKey: runtime.selection.providerKey,
        authMode: connection.authMode,
      },
    });
    return { runtime, credentials };
  }
}
