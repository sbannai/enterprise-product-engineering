import type {
  CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
  SpiffeWorkloadApiClient,
} from "./customer-asset-scan-child-spiffe-identity.js";

/**
 * Minimal structural surface of @jeengbe/spiffe's SpiffeClient.
 * Keeping this structural avoids coupling scanner policy to the SDK package.
 */
export interface SpiffeSdkJwtClient {
  getJwtSvid(
    audience: string,
    filter?: { spiffeId?: string },
    signal?: AbortSignal,
  ): Promise<{
    spiffeId: string;
    token: string;
    expiresAtMs: number;
  } | null>;
}

/**
 * Adapts the TypeScript SPIFFE SDK's child-local getJwtSvid() operation to
 * EPER's narrow identity port. The JWT itself is intentionally discarded.
 */
export class CustomerAssetScanChildSpiffeSdkAdapter implements SpiffeWorkloadApiClient {
  constructor(private readonly sdk: SpiffeSdkJwtClient) {}

  async fetchJwtSvid(input: {
    audience: readonly [typeof CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE];
    spiffeId: string;
    signal?: AbortSignal;
  }): Promise<readonly { spiffeId: string; expiresAtMs: number }[]> {
    const svid = await this.sdk.getJwtSvid(input.audience[0], {
      spiffeId: input.spiffeId,
    }, input.signal);
    if (!svid) return [];
    if (typeof svid.token !== "string" || svid.token.length === 0) {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SVID_INVALID");
    }
    return [{
      spiffeId: svid.spiffeId,
      expiresAtMs: svid.expiresAtMs,
    }];
  }
}


export interface SpiffeSdkClientLifecycle extends SpiffeSdkJwtClient {
  close(): void | Promise<void>;
}

export interface SpiffeSdkClientConstructor {
  new (options: {
    connection: string;
    retry: { enabled: false };
  }): SpiffeSdkClientLifecycle;
}

export interface CustomerAssetScanChildSpiffeSdkRuntime {
  readonly adapter: CustomerAssetScanChildSpiffeSdkAdapter;
  close(): Promise<void>;
}

function isExplicitUnixSocket(value: string): boolean {
  if (!value.startsWith("unix:///")) return false;
  const path = value.slice("unix://".length);
  return path.startsWith("/") &&
    !/[?#\s\u0000-\u001f\u007f]/.test(path) &&
    !path.split("/").includes("..");
}

/**
 * Constructs the SDK only from a deployment-supplied absolute Unix socket.
 * No environment fallback is permitted. SDK retries are disabled because the
 * parent supervisor owns retry policy and the child attempt has a hard deadline.
 */
export function createCustomerAssetScanChildSpiffeSdkRuntime(input: {
  readonly endpoint: string;
  readonly SpiffeClient: SpiffeSdkClientConstructor;
}): CustomerAssetScanChildSpiffeSdkRuntime {
  if (!isExplicitUnixSocket(input.endpoint)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SOCKET_INVALID");
  }
  const sdk = new input.SpiffeClient({
    connection: input.endpoint,
    retry: { enabled: false },
  });
  let closed = false;
  return Object.freeze({
    adapter: new CustomerAssetScanChildSpiffeSdkAdapter(sdk),
    async close() {
      if (closed) return;
      closed = true;
      await sdk.close();
    },
  });
}
