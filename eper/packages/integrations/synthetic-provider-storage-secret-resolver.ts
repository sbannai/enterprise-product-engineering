import type { ProviderCredentialContext, ProviderSecretResolverPort } from "./provider-credential-resolution-service.js";
import type { SyntheticStorageCredentials } from "./synthetic-provider-storage-driver.js";

/**
 * Local/test-only secret resolver. It accepts synthetic:// references only and
 * returns a marker, never secret material. No secret manager or network access.
 */
export class SyntheticProviderStorageSecretResolver
implements ProviderSecretResolverPort<SyntheticStorageCredentials> {
  async resolve(input: { secretReference: string; context: ProviderCredentialContext }): Promise<SyntheticStorageCredentials> {
    if (!input || typeof input.secretReference !== "string" ||
        !/^synthetic:\/\/[A-Za-z0-9._/-]{1,200}$/.test(input.secretReference) ||
        !input.context || ![input.context.tenantId, input.context.applicationId,
          input.context.connectionId, input.context.providerKey, input.context.authMode]
          .every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 128)) {
      throw new Error("SYNTHETIC_STORAGE_SECRET_REFERENCE_REQUIRED");
    }
    return Object.freeze({ synthetic: true as const, marker: "ephemeral-test-only" as const });
  }
}
