import type { ProviderRuntimeCredentialResolutionService } from "../integrations/provider-runtime-credential-resolution-service.js";
import { CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY } from "./customer-asset-scan-child-identity.js";

export class CustomerAssetScanChildProviderCredentialResolverError extends Error {
  constructor(readonly code:
    | "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_SCOPE_MISMATCH"
    | "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_UNAVAILABLE") {
    super(code);
    this.name = "CustomerAssetScanChildProviderCredentialResolverError";
  }
}

/**
 * Child-local bridge to EPER's existing provider authorization and secret
 * resolution chain. It does not create a second provider registry or accept a
 * secret reference. Call only after the child identity has been independently
 * verified; the runtime must be composed inside that child process.
 */
export class CustomerAssetScanChildProviderCredentialResolver<TCredentials> {
  constructor(
    private readonly runtime: Pick<
      ProviderRuntimeCredentialResolutionService<unknown, TCredentials>,
      "resolve"
    >,
    private readonly expectedScannerServiceId: string,
  ) {
    if (typeof expectedScannerServiceId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(expectedScannerServiceId)) {
      throw new CustomerAssetScanChildProviderCredentialResolverError(
        "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_SCOPE_MISMATCH",
      );
    }
  }

  async resolveScanCredentials(input: {
    tenantId: string;
    applicationId: string;
    connectionId: string;
    scannerServiceId: string;
    capability: typeof CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY;
  }): Promise<TCredentials> {
    if (!input ||
        ![input.tenantId, input.applicationId, input.connectionId, input.scannerServiceId]
          .every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 128) ||
        input.scannerServiceId !== this.expectedScannerServiceId ||
        input.capability !== CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY) {
      throw new CustomerAssetScanChildProviderCredentialResolverError(
        "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_SCOPE_MISMATCH",
      );
    }

    let resolved: Awaited<ReturnType<typeof this.runtime.resolve>>;
    try {
      resolved = await this.runtime.resolve({
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        capability: CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY,
        expectedConnectionId: input.connectionId,
      });
    } catch {
      throw new CustomerAssetScanChildProviderCredentialResolverError(
        "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_UNAVAILABLE",
      );
    }

    const selection = resolved?.runtime?.selection;
    if (!selection ||
        selection.tenantId !== input.tenantId ||
        selection.applicationId !== input.applicationId ||
        selection.connectionId !== input.connectionId ||
        selection.capabilityKey !== CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY ||
        resolved.runtime.capability !== CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY ||
        resolved.credentials === null || resolved.credentials === undefined) {
      throw new CustomerAssetScanChildProviderCredentialResolverError(
        "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_SCOPE_MISMATCH",
      );
    }
    return resolved.credentials;
  }
}
