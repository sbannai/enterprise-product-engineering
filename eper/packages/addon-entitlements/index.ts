/**
 * Shared fail-closed entitlement gate for optional application add-ons.
 * This module performs no database access, billing action or capability startup.
 */
export type ApplicationAddonEntitlementStatus =
  | "not_selected" | "requested" | "pending_approval" | "pending_payment"
  | "active" | "suspended" | "cancelled" | "expired";

export interface ApplicationAddonEntitlement {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly addonKey: string;
  readonly status: ApplicationAddonEntitlementStatus;
  readonly priceId: string | null;
  readonly acceptedPriceVersion: number | null;
  readonly agreedAmount: string | null;
  readonly agreedCurrency: string | null;
  readonly billingInterval: "monthly" | "annual" | "one_time" | "usage" | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly usageLimit: Readonly<Record<string, unknown>>;
  readonly version: number;
}

export type AddonAccessDecision =
  | { readonly allowed: true; readonly reason: "ENTITLEMENT_ACTIVE" }
  | { readonly allowed: false; readonly reason:
      | "ENTITLEMENT_NOT_FOUND" | "SCOPE_MISMATCH" | "ENTITLEMENT_NOT_ACTIVE"
      | "PRICE_ACCEPTANCE_INCOMPLETE" | "ENTITLEMENT_NOT_YET_EFFECTIVE"
      | "ENTITLEMENT_EXPIRED" | "CATALOGUE_NOT_PUBLISHED" };

export function evaluateApplicationAddonAccess(input: {
  entitlement: ApplicationAddonEntitlement | null;
  tenantId: string;
  applicationId: string;
  addonKey: string;
  catalogueStatus: "draft" | "active" | "deprecated" | "disabled";
  now?: Date;
}): AddonAccessDecision {
  const row = input.entitlement;
  if (!row) return { allowed: false, reason: "ENTITLEMENT_NOT_FOUND" };
  if (row.tenantId !== input.tenantId || row.applicationId !== input.applicationId ||
      row.addonKey !== input.addonKey) {
    return { allowed: false, reason: "SCOPE_MISMATCH" };
  }
  if (input.catalogueStatus !== "active") {
    return { allowed: false, reason: "CATALOGUE_NOT_PUBLISHED" };
  }
  if (row.status !== "active") return { allowed: false, reason: "ENTITLEMENT_NOT_ACTIVE" };
  if (!row.priceId || !Number.isSafeInteger(row.acceptedPriceVersion) || (row.acceptedPriceVersion ?? 0) < 1 ||
      row.agreedAmount === null || !/^[A-Z]{3}$/.test(row.agreedCurrency ?? "") ||
      row.billingInterval === null) {
    return { allowed: false, reason: "PRICE_ACCEPTANCE_INCOMPLETE" };
  }
  const now = (input.now ?? new Date()).getTime();
  if (!row.effectiveFrom || !Number.isFinite(Date.parse(row.effectiveFrom)) ||
      Date.parse(row.effectiveFrom) > now) {
    return { allowed: false, reason: "ENTITLEMENT_NOT_YET_EFFECTIVE" };
  }
  if (row.effectiveTo !== null &&
      (!Number.isFinite(Date.parse(row.effectiveTo)) || Date.parse(row.effectiveTo) <= now)) {
    return { allowed: false, reason: "ENTITLEMENT_EXPIRED" };
  }
  return { allowed: true, reason: "ENTITLEMENT_ACTIVE" };
}
