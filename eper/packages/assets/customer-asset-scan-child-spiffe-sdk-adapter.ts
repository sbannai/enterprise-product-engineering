import {
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
  ): Promise<{
    spiffeId: string;
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
  }): Promise<readonly { spiffeId: string; expiresAtMs: number }[]> {
    const svid = await this.sdk.getJwtSvid(input.audience[0], {
      spiffeId: input.spiffeId,
    });
    if (!svid) return [];
    return [{
      spiffeId: svid.spiffeId,
      expiresAtMs: svid.expiresAtMs,
    }];
  }
}
