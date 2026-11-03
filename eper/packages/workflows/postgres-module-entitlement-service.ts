import type { AuditSqlPool } from "../audit/audit-event-store.js";
import {
  evaluateApplicationAddonAccess,
  evaluateCustomerTariffAccess,
  evaluateModuleAccess,
  type AccessDecision,
  type AddonEntitlementStatus,
  type ModuleEntitlementStatus,
} from "./module-entitlement-policy.js";

export interface TrustedAccessContext {
  tenantId: string;
  applicationId: string;
  roleKey: string;
  permissionKey: string;
  now?: Date;
}

export interface ApplicationOwnershipResolver {
  /** Must consult trusted server-side application/tenant assignment data. */
  isAssignedToTenant(tenantId: string, applicationId: string): Promise<boolean>;
}

type ModuleStatus = "draft" | "active" | "deprecated" | "disabled";

interface ModuleAccessRow {
  customer_status: string | null;
  module_status: ModuleStatus | null;
  entitlement_status: ModuleEntitlementStatus | null;
  starts_at: string | Date | null;
  ends_at: string | Date | null;
  grace_until: string | Date | null;
  permission_allowed: boolean | null;
  tariff_assignment_status: string | null;
  tariff_max_applications: number | string | null;
  active_application_count: number | string;
  tariff_starts_at: string | Date | null;
  tariff_ends_at: string | Date | null;
}

interface AddonAccessRow {
  customer_status: string | null;
  addon_status: ModuleStatus | null;
  entitlement_status: AddonEntitlementStatus | null;
  effective_from: string | Date | null;
  effective_to: string | Date | null;
  permission_allowed: boolean | null;
  tariff_assignment_status: string | null;
  tariff_max_applications: number | string | null;
  active_application_count: number | string;
  tariff_starts_at: string | Date | null;
  tariff_ends_at: string | Date | null;
}

/**
 * Server-side entitlement service. Identity and role context must come from
 * authenticated middleware; this service intentionally has no request-body auth path.
 * Missing rows, disabled modules, absent permissions, and unassigned applications deny.
 */
export class PostgresModuleEntitlementService {
  constructor(
    private readonly pool: AuditSqlPool,
    private readonly ownership: ApplicationOwnershipResolver,
  ) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        module_catalog: string | null;
        module_price: string | null;
        module_entitlement: string | null;
        module_permission: string | null;
        addon_entitlement: string | null;
        customer_account: string | null;
        customer_tariff_assignment: string | null;
        tenant_application_assignment: string | null;
      }>(`
        SELECT
          to_regclass('public.eper_module_catalog')::text AS module_catalog,
          to_regclass('public.eper_module_price')::text AS module_price,
          to_regclass('public.eper_customer_module_entitlement')::text AS module_entitlement,
          to_regclass('public.eper_customer_module_permission')::text AS module_permission,
          to_regclass('public.eper_application_addon_entitlement')::text AS addon_entitlement,
          to_regclass('public.eper_customer_account')::text AS customer_account,
          to_regclass('public.eper_customer_tariff_assignment')::text AS customer_tariff_assignment,
          to_regclass('public.eper_tenant_application_assignment')::text AS tenant_application_assignment
      `);
      const row = result.rows[0];
      if (!row || !row.module_catalog || !row.module_price || !row.module_entitlement ||
          !row.module_permission || !row.addon_entitlement || !row.customer_account ||
          !row.customer_tariff_assignment || !row.tenant_application_assignment) {
        throw new Error("EPER_MODULE_ENTITLEMENT_SCHEMA_NOT_APPLIED");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_MODULE_ENTITLEMENT_SCHEMA_NOT_APPLIED") throw error;
      throw new Error("EPER_MODULE_ENTITLEMENT_READINESS_FAILED", { cause: error });
    } finally {
      client.release();
    }
  }

  async checkModule(
    context: TrustedAccessContext,
    moduleKey: string,
  ): Promise<AccessDecision> {
    validateContext(context);
    validateKey(moduleKey, "moduleKey");
    const assigned = await this.ownership.isAssignedToTenant(context.tenantId, context.applicationId);
    if (!assigned) return { allowed: false, reason: "application_not_assigned" };

    const client = await this.pool.connect();
    try {

      const result = await client.query<ModuleAccessRow>(
        `SELECT ca.customer_status, c.status AS module_status, e.entitlement_status, e.starts_at, e.ends_at,
                e.grace_until, p.allowed AS permission_allowed,
                ta.assignment_status AS tariff_assignment_status,
                ta.max_applications AS tariff_max_applications,
                COALESCE(active_apps.application_count, 0) AS active_application_count,
                ta.starts_at AS tariff_starts_at, ta.ends_at AS tariff_ends_at
           FROM (SELECT $1::text AS module_key) requested
           LEFT JOIN eper_customer_account ca ON ca.tenant_id = $2
           LEFT JOIN eper_customer_tariff_assignment ta ON ta.tenant_id = $2
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS application_count
               FROM eper_tenant_application_assignment aa
              WHERE aa.tenant_id = $2 AND aa.assignment_status = 'active'
           ) active_apps ON TRUE
           LEFT JOIN eper_module_catalog c ON c.module_key = requested.module_key
           LEFT JOIN eper_customer_module_entitlement e
             ON e.tenant_id = $2 AND e.module_key = requested.module_key
           LEFT JOIN eper_customer_module_permission p
             ON p.tenant_id = $2 AND p.module_key = requested.module_key
            AND p.role_key = $3 AND p.permission_key = $4
          LIMIT 1`,
        [moduleKey, context.tenantId, context.roleKey, context.permissionKey],
      );
      const row = result.rows[0];
      if (row?.customer_status !== "active") return { allowed: false, reason: "customer_inactive" };
      const commercial = evaluateCustomerTariffAccess({
        assignmentStatus: row?.tariff_assignment_status ?? null,
        maxApplications: row?.tariff_max_applications ?? null,
        activeApplicationCount: row?.active_application_count ?? 0,
        startsAt: row?.tariff_starts_at,
        endsAt: row?.tariff_ends_at,
        now: context.now,
      });
      if (!commercial.allowed) return commercial;
      return evaluateModuleAccess({
        moduleStatus: row?.module_status ?? "disabled",
        entitlementStatus: row?.entitlement_status ?? null,
        rolePermissionAllowed: row?.permission_allowed === true,
        applicationAssignedToTenant: true,
        now: context.now,
        startsAt: row?.starts_at,
        endsAt: row?.ends_at,
        graceUntil: row?.grace_until,
      });
    } finally {
      client.release();
    }
  }

  async checkApplicationAddon(
    context: TrustedAccessContext,
    addonKey: string,
  ): Promise<AccessDecision> {
    validateContext(context);
    validateKey(addonKey, "addonKey");
    const assigned = await this.ownership.isAssignedToTenant(context.tenantId, context.applicationId);
    if (!assigned) return { allowed: false, reason: "application_not_assigned" };

    const client = await this.pool.connect();
    try {

      const result = await client.query<AddonAccessRow>(
        `SELECT ca.customer_status, c.status AS addon_status, e.entitlement_status, e.effective_from, e.effective_to,
                p.allowed AS permission_allowed,
                ta.assignment_status AS tariff_assignment_status,
                ta.max_applications AS tariff_max_applications,
                COALESCE(active_apps.application_count, 0) AS active_application_count,
                ta.starts_at AS tariff_starts_at, ta.ends_at AS tariff_ends_at
           FROM (SELECT $1::text AS addon_key) requested
           LEFT JOIN eper_customer_account ca ON ca.tenant_id = $2
           LEFT JOIN eper_customer_tariff_assignment ta ON ta.tenant_id = $2
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS application_count
               FROM eper_tenant_application_assignment aa
              WHERE aa.tenant_id = $2 AND aa.assignment_status = 'active'
           ) active_apps ON TRUE
           LEFT JOIN eper_module_catalog c ON c.module_key = requested.addon_key
           LEFT JOIN eper_application_addon_entitlement e
             ON e.tenant_id = $2 AND e.application_id = $3 AND e.addon_key = requested.addon_key
           LEFT JOIN eper_customer_module_permission p
             ON p.tenant_id = $2 AND p.module_key = requested.addon_key
            AND p.role_key = $4 AND p.permission_key = $5
          LIMIT 1`,
        [addonKey, context.tenantId, context.applicationId, context.roleKey, context.permissionKey],
      );
      const row = result.rows[0];
      if (row?.customer_status !== "active") return { allowed: false, reason: "customer_inactive" };
      const commercial = evaluateCustomerTariffAccess({
        assignmentStatus: row?.tariff_assignment_status ?? null,
        maxApplications: row?.tariff_max_applications ?? null,
        activeApplicationCount: row?.active_application_count ?? 0,
        startsAt: row?.tariff_starts_at,
        endsAt: row?.tariff_ends_at,
        now: context.now,
      });
      if (!commercial.allowed) return commercial;
      return evaluateApplicationAddonAccess({
        addonStatus: row?.addon_status ?? "disabled",
        entitlementStatus: row?.entitlement_status ?? null,
        rolePermissionAllowed: row?.permission_allowed === true,
        applicationAssignedToTenant: true,
        now: context.now,
        effectiveFrom: row?.effective_from,
        effectiveTo: row?.effective_to,
      });
    } finally {
      client.release();
    }
  }
}

function validateContext(context: TrustedAccessContext): void {
  validateKey(context.tenantId, "tenantId");
  validateKey(context.applicationId, "applicationId");
  validateKey(context.roleKey, "roleKey");
  validateKey(context.permissionKey, "permissionKey");
}

function validateKey(value: string, name: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new Error("EPER_ENTITLEMENT_" + name.toUpperCase() + "_INVALID");
  }
}
