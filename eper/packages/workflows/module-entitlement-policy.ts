export type ModuleEntitlementStatus = "pending" | "trial" | "active" | "suspended" | "cancelled" | "expired";
export type AddonEntitlementStatus = "not_selected" | "requested" | "pending_approval" | "pending_payment" | "active" | "suspended" | "cancelled" | "expired";

export interface ModuleAccessInput {
  moduleStatus: "draft" | "active" | "deprecated" | "disabled";
  entitlementStatus: ModuleEntitlementStatus | null;
  rolePermissionAllowed: boolean;
  applicationAssignedToTenant: boolean;
  now?: Date;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  graceUntil?: string | Date | null;
}

export interface AddonAccessInput {
  addonStatus: "draft" | "active" | "deprecated" | "disabled";
  entitlementStatus: AddonEntitlementStatus | null;
  rolePermissionAllowed: boolean;
  applicationAssignedToTenant: boolean;
  now?: Date;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
}

export interface AccessDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "customer_inactive"
    | "module_disabled"
    | "entitlement_missing"
    | "entitlement_inactive"
    | "not_started"
    | "expired"
    | "application_not_assigned"
    | "role_permission_denied"
    | "addon_not_selected"
    | "addon_not_active";
}

/**
 * Fail-closed module authorization. Inputs must come from trusted server-side
 * lookups; never construct them from customer-supplied entitlement claims.
 */
export function evaluateModuleAccess(input: ModuleAccessInput): AccessDecision {
  if (!input.applicationAssignedToTenant) return deny("application_not_assigned");
  if (input.moduleStatus !== "active") return deny("module_disabled");
  if (!input.entitlementStatus) return deny("entitlement_missing");
  if (input.entitlementStatus !== "active" && input.entitlementStatus !== "trial") return deny("entitlement_inactive");
  const now = (input.now ?? new Date()).getTime();
  const starts = toTime(input.startsAt);
  const ends = toTime(input.endsAt);
  const grace = toTime(input.graceUntil);
  if (starts !== null && now < starts) return deny("not_started");
  if (ends !== null && now > ends && (grace === null || now > grace)) return deny("expired");
  if (!input.rolePermissionAllowed) return deny("role_permission_denied");
  return { allowed: true, reason: "allowed" };
}

/**
 * Add-ons are independent, application-scoped entitlements. A core module
 * entitlement never grants Marketing, Sales, or AI access implicitly.
 */
export function evaluateApplicationAddonAccess(input: AddonAccessInput): AccessDecision {
  if (!input.applicationAssignedToTenant) return deny("application_not_assigned");
  if (input.addonStatus !== "active") return deny("module_disabled");
  if (!input.entitlementStatus || input.entitlementStatus === "not_selected") return deny("addon_not_selected");
  if (input.entitlementStatus !== "active") return deny("addon_not_active");
  const now = (input.now ?? new Date()).getTime();
  const starts = toTime(input.effectiveFrom);
  const ends = toTime(input.effectiveTo);
  if (starts !== null && now < starts) return deny("not_started");
  if (ends !== null && now > ends) return deny("expired");
  if (!input.rolePermissionAllowed) return deny("role_permission_denied");
  return { allowed: true, reason: "allowed" };
}

export interface AcceptedPriceSnapshot {
  priceId: string;
  priceVersion: number;
  amount: string | number;
  currency: string;
  billingInterval: "monthly" | "annual" | "one_time" | "usage";
}

/** Validate commercial snapshots without converting money through floating-point arithmetic. */
export function validateAcceptedPriceSnapshot(snapshot: AcceptedPriceSnapshot | null | undefined): AccessDecision {
  if (!snapshot) return deny("entitlement_missing");
  if (!snapshot.priceId.trim() || !Number.isSafeInteger(snapshot.priceVersion) || snapshot.priceVersion < 1) {
    return deny("entitlement_inactive");
  }
  const amount = String(snapshot.amount);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(amount)) return deny("entitlement_inactive");
  if (!/^[A-Z]{3}$/.test(snapshot.currency)) return deny("entitlement_inactive");
  if (!["monthly", "annual", "one_time", "usage"].includes(snapshot.billingInterval)) return deny("entitlement_inactive");
  return { allowed: true, reason: "allowed" };
}

function toTime(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("ENTITLEMENT_DATE_INVALID");
  return result;
}

function deny(reason: AccessDecision["reason"]): AccessDecision {
  return { allowed: false, reason };
}
