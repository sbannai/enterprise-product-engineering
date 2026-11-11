export type ProviderCredentialContext = {
  tenantId: string;
  applicationId: string;
  connectionId: string;
  providerKey: string;
  authMode: string;
};

export interface ProviderSecretResolverPort<TCredentials> {
  resolve(input: {
    secretReference: string;
    context: ProviderCredentialContext;
  }): Promise<TCredentials>;
}

export class ProviderCredentialResolutionError extends Error {
  constructor(readonly code:
    | "PROVIDER_SECRET_REFERENCE_INVALID"
    | "PROVIDER_SECRET_RESOLVER_UNAVAILABLE"
    | "PROVIDER_SECRET_RESOLUTION_EMPTY") {
    super(code);
    this.name = "ProviderCredentialResolutionError";
  }
}

const validIdentity = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 128;

/**
 * Server-side credential boundary. The opaque reference is supplied by trusted
 * server composition after tenant/application authorization; resolved material
 * is returned only to the caller and is never copied into metadata or events.
 */
export class ProviderCredentialResolutionService<TCredentials> {
  constructor(private readonly resolver: ProviderSecretResolverPort<TCredentials>) {}

  async resolve(input: {
    secretReference: string;
    context: ProviderCredentialContext;
  }): Promise<TCredentials> {
    if (typeof input?.secretReference !== "string" ||
        !input.secretReference.trim() || input.secretReference.length > 512 ||
        !input.context || !validIdentity(input.context.tenantId) ||
        !validIdentity(input.context.applicationId) ||
        !validIdentity(input.context.connectionId) ||
        !validIdentity(input.context.providerKey) ||
        !validIdentity(input.context.authMode)) {
      throw new ProviderCredentialResolutionError("PROVIDER_SECRET_REFERENCE_INVALID");
    }
    let credentials: TCredentials;
    try {
      credentials = await this.resolver.resolve({
        secretReference: input.secretReference,
        context: { ...input.context },
      });
    } catch {
      // Do not propagate secret-manager errors: they may contain secret values
      // or infrastructure details that must not reach API or audit responses.
      throw new ProviderCredentialResolutionError("PROVIDER_SECRET_RESOLVER_UNAVAILABLE");
    }
    if (credentials === null || credentials === undefined) {
      throw new ProviderCredentialResolutionError("PROVIDER_SECRET_RESOLUTION_EMPTY");
    }
    return credentials;
  }
}
