import type { ProviderDispatchSelection } from "./provider-dispatch-configuration-service.js";
import type { ProviderSecretResolver } from "./provider-connection-validation-service.js";

/**
 * Narrow, server-only credential boundary for provider operation dispatch.
 * The store returns an opaque reference only after rechecking the live
 * tenant/application binding, capability and connection version.
 */
export interface ProviderRuntimeSecretReferenceStore {
  getDispatchSecretReference(input: {
    tenantId: string;
    applicationId: string;
    connectionId: string;
    connectionVersion: number;
    capabilityKey: string;
  }): Promise<string>;
  assertDispatchAuthorization(input: {
    tenantId: string;
    applicationId: string;
    connectionId: string;
    connectionVersion: number;
    capabilityKey: string;
  }): Promise<void>;
}

export class ProviderRuntimeCredentialError extends Error {
  constructor(readonly code:
    | "PROVIDER_RUNTIME_CREDENTIAL_SCOPE_INVALID"
    | "PROVIDER_RUNTIME_CREDENTIAL_REFERENCE_UNAVAILABLE"
    | "PROVIDER_RUNTIME_CREDENTIAL_AUTHORIZATION_CHANGED"
    | "PROVIDER_RUNTIME_CREDENTIAL_RESOLUTION_FAILED") {
    super(code);
    this.name = "ProviderRuntimeCredentialError";
  }
}

/**
 * Credentials are resolved immediately before dispatch and are never returned
 * to API callers, persisted, audited or logged by this boundary.
 */
export class ProviderRuntimeCredentialResolver {
  constructor(
    private readonly references: ProviderRuntimeSecretReferenceStore,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async resolve(selection: ProviderDispatchSelection): Promise<unknown> {
    if (!selection
      || typeof selection.tenantId !== "string" || !selection.tenantId.trim()
      || typeof selection.applicationId !== "string" || !selection.applicationId.trim()
      || typeof selection.connectionId !== "string" || !selection.connectionId.trim()
      || !Number.isSafeInteger(selection.connectionVersion) || selection.connectionVersion < 1
      || typeof selection.capabilityKey !== "string" || !selection.capabilityKey.trim()) {
      throw new ProviderRuntimeCredentialError("PROVIDER_RUNTIME_CREDENTIAL_SCOPE_INVALID");
    }

    let reference: string;
    try {
      reference = await this.references.getDispatchSecretReference({
        tenantId: selection.tenantId,
        applicationId: selection.applicationId,
        connectionId: selection.connectionId,
        connectionVersion: selection.connectionVersion,
        capabilityKey: selection.capabilityKey,
      });
    } catch {
      throw new ProviderRuntimeCredentialError("PROVIDER_RUNTIME_CREDENTIAL_REFERENCE_UNAVAILABLE");
    }
    if (typeof reference !== "string" || !reference.trim()) {
      throw new ProviderRuntimeCredentialError("PROVIDER_RUNTIME_CREDENTIAL_REFERENCE_UNAVAILABLE");
    }

    try {
      const credentials = await this.secrets.resolve(reference);
      if (credentials === null || credentials === undefined) {
        throw new Error("EMPTY_SECRET");
      }
      await this.references.assertDispatchAuthorization({
        tenantId: selection.tenantId,
        applicationId: selection.applicationId,
        connectionId: selection.connectionId,
        connectionVersion: selection.connectionVersion,
        capabilityKey: selection.capabilityKey,
      });
      return credentials;
    } catch (error) {
      // Provider/secret-manager exception text can contain credential material.
      if (error instanceof Error && error.message === "PROVIDER_DISPATCH_AUTHORIZATION_CHANGED") {
        throw new ProviderRuntimeCredentialError("PROVIDER_RUNTIME_CREDENTIAL_AUTHORIZATION_CHANGED");
      }
      throw new ProviderRuntimeCredentialError("PROVIDER_RUNTIME_CREDENTIAL_RESOLUTION_FAILED");
    }
  }
}
