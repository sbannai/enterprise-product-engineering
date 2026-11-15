import type { CustomerAssetScanChildRuntimeDependencies } from "./customer-asset-scan-child-runtime.js";

export type CustomerAssetScanChildRuntimeComposition =
  CustomerAssetScanChildRuntimeDependencies & {
    /** Optional cleanup for child-local SDK clients, pools and provider resources. */
    close?: () => void | Promise<void>;
  };

/**
 * Validate the deployment-owned module's callable surface before any scan
 * attempt is accepted. Presence of dependency objects alone is insufficient:
 * a malformed composition must fail at bootstrap, not halfway through a job.
 */
export function assertCustomerAssetScanChildRuntimeComposition(
  value: unknown,
): asserts value is CustomerAssetScanChildRuntimeComposition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_INVALID");
  }
  const composition = value as Record<string, unknown>;
  const identity = composition.identity as Record<string, unknown> | null;
  const input = composition.input as Record<string, unknown> | null;
  const provider = composition.provider as Record<string, unknown> | null;
  const scanner = composition.scanner as Record<string, unknown> | null;
  if (!identity || typeof identity.verifyCurrentProcessIdentity !== "function" ||
      !input || typeof input.resolve !== "function" ||
      !provider || typeof provider.dispatch !== "function" ||
      !scanner || typeof scanner.scan !== "function" ||
      (composition.close !== undefined && typeof composition.close !== "function")) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_INVALID");
  }
}
