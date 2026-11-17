import type {
  CustomerAssetScanChildJwtSvidValidator,
} from "./customer-asset-scan-child-database-signer-policy.js";

export interface CustomerAssetScanChildSignerSpiffeSdkClient {
  validateJwt(
    audience: string,
    token: string,
  ): Promise<{
    readonly spiffeId: string;
    readonly claims: Readonly<Record<string, unknown>>;
  } | null>;
  close(): void | Promise<void>;
}

export interface CustomerAssetScanChildSignerSpiffeSdkConstructor {
  new (options: {
    readonly connection: string;
    readonly retry: { readonly enabled: false };
  }): CustomerAssetScanChildSignerSpiffeSdkClient;
}

export interface CustomerAssetScanChildSignerSpiffeSdkRuntime {
  readonly validator: CustomerAssetScanChildJwtSvidValidator;
  close(): Promise<void>;
}

function validUnixSocket(endpoint: string): boolean {
  if (!endpoint.startsWith("unix:///")) return false;
  const path = endpoint.slice("unix://".length);
  return path.startsWith("/") &&
    !/[?#\s\u0000-\u001f\u007f]/.test(path) &&
    !path.split("/").includes("..");
}

/**
 * Creates the signer process's own SPIFFE SDK client. This must run inside
 * the isolated signer workload, not in the scanner child. The signer therefore
 * validates the presented SVID using its own Workload API access and identity.
 */
export function createCustomerAssetScanChildSignerSpiffeSdkRuntime(input: {
  readonly endpoint: string;
  readonly SpiffeClient: CustomerAssetScanChildSignerSpiffeSdkConstructor;
}): CustomerAssetScanChildSignerSpiffeSdkRuntime {
  if (!validUnixSocket(input.endpoint)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_SPIFFE_SOCKET_INVALID");
  }
  const sdk = new input.SpiffeClient({
    connection: input.endpoint,
    retry: { enabled: false },
  });
  let closed = false;
  return Object.freeze({
    validator: Object.freeze({
      async validateJwt(audience: string, token: string) {
        return sdk.validateJwt(audience, token);
      },
    }),
    async close() {
      if (closed) return;
      closed = true;
      await sdk.close();
    },
  });
}
