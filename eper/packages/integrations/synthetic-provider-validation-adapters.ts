import type {
  ProviderSecretResolver,
  ProviderValidationAdapterRegistry,
} from "./provider-connection-validation-service.js";

/**
 * Deliberately synthetic adapter support for local development and sandbox
 * integration tests. It performs no network calls and cannot resolve real
 * secret-manager references.
 */
export class SyntheticProviderSecretResolver implements ProviderSecretResolver {
  async resolve(secretReference: string): Promise<unknown> {
    if (!/^synthetic:\/\/[A-Za-z0-9._/-]{1,200}$/.test(secretReference)) {
      throw new Error("SYNTHETIC_SECRET_REFERENCE_REQUIRED");
    }
    return Object.freeze({ synthetic: true });
  }
}

export class SyntheticProviderValidationAdapterRegistry implements ProviderValidationAdapterRegistry {
  get(adapterKey: string, adapterVersion: string) {
    if (adapterKey !== "synthetic" || adapterVersion !== "1.0.0") return null;
    return {
      async validateCredentials(input: { credentials: unknown }) {
        const credentials = input.credentials;
        return {
          ok: Boolean(credentials && typeof credentials === "object" &&
            (credentials as { synthetic?: unknown }).synthetic === true),
          errorCode: "SYNTHETIC_CREDENTIALS_INVALID",
        };
      },
    };
  }
}
