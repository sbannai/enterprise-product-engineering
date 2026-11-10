import type { AuditSqlClient, AuditSqlPool } from "../audit/audit-event-store.js";
import type {
  ApplicationAddonEntitlement,
} from "./index.js";
import type {
  ApplicationAddonEntitlementReader,
  ModuleCatalogueReader,
} from "./application-addon-access-gate.js";

type EntitlementRow = {
  tenant_id: string; application_id: string; addon_key: string; entitlement_status: ApplicationAddonEntitlement["status"];
  price_id: string | null; accepted_price_version: number | string | null;
  agreed_amount: string | number | null; agreed_currency: string | null;
  billing_interval: ApplicationAddonEntitlement["billingInterval"];
  effective_from: Date | string | null; effective_to: Date | string | null;
  usage_limit: Record<string, unknown> | string; version: number | string;
};
function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("APPLICATION_ADDON_TIMESTAMP_INVALID");
  return parsed.toISOString();
}
function safePositiveInteger(value: number | string | null, code: string): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(code);
  return parsed;
}
function mapEntitlement(row: EntitlementRow): ApplicationAddonEntitlement {
  const usageLimit = typeof row.usage_limit === "string" ? JSON.parse(row.usage_limit) : row.usage_limit;
  if (!usageLimit || typeof usageLimit !== "object" || Array.isArray(usageLimit)) {
    throw new Error("APPLICATION_ADDON_USAGE_LIMIT_INVALID");
  }
  const amount = row.agreed_amount === null ? null : String(row.agreed_amount);
  if (amount !== null && (!/^(?:0|[1-9]\d*)(?:\\.\d{1,4})?$/.test(amount) || !Number.isFinite(Number(amount)))) {
    throw new Error("APPLICATION_ADDON_AMOUNT_INVALID");
  }
  const currency = row.agreed_currency?.trim() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw new Error("APPLICATION_ADDON_CURRENCY_INVALID");
  if (!["not_selected", "requested", "pending_approval", "pending_payment", "active", "suspended", "cancelled", "expired"].includes(row.entitlement_status)) {
    throw new Error("APPLICATION_ADDON_STATUS_INVALID");
  }
  if (row.billing_interval !== null && !["monthly", "annual", "one_time", "usage"].includes(row.billing_interval)) {
    throw new Error("APPLICATION_ADDON_BILLING_INTERVAL_INVALID");
  }
  if (![row.tenant_id, row.application_id, row.addon_key].every(v => typeof v === "string" && v.trim())) {
    throw new Error("APPLICATION_ADDON_SCOPE_INVALID");
  }
  return {
    tenantId: row.tenant_id, applicationId: row.application_id, addonKey: row.addon_key,
    status: row.entitlement_status, priceId: row.price_id,
    acceptedPriceVersion: safePositiveInteger(row.accepted_price_version, "APPLICATION_ADDON_PRICE_VERSION_INVALID"),
    agreedAmount: amount, agreedCurrency: currency, billingInterval: row.billing_interval,
    effectiveFrom: iso(row.effective_from), effectiveTo: iso(row.effective_to),
    usageLimit, version: safePositiveInteger(row.version, "APPLICATION_ADDON_VERSION_INVALID")!,
  };
}

/**
 * Reads only the exact tenant/application add-on entitlement. RLS context is
 * transaction-local and reset automatically at transaction end for pooled clients.
 */
export class PostgresApplicationAddonEntitlementReader
implements ApplicationAddonEntitlementReader, ModuleCatalogueReader {
  constructor(private readonly pool: AuditSqlPool) {}

  private async withScope<T>(
    tenantId: string, applicationId: string | null,
    work: (client: AuditSqlClient) => Promise<T>,
  ): Promise<T> {
    if (!tenantId?.trim() || tenantId.length > 128 ||
        (applicationId !== null && (!applicationId.trim() || applicationId.length > 128))) {
      throw new Error("APPLICATION_ADDON_READ_SCOPE_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      if (applicationId !== null) {
        await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      }
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async get(input: { tenantId: string; applicationId: string; addonKey: string }): Promise<ApplicationAddonEntitlement | null> {
    if (!input.addonKey?.trim() || input.addonKey.length > 128) throw new Error("APPLICATION_ADDON_KEY_INVALID");
    return this.withScope(input.tenantId, input.applicationId, async client => {
      const result = await client.query<EntitlementRow>(
        `SELECT tenant_id, application_id, addon_key, entitlement_status, price_id,
                accepted_price_version, agreed_amount, agreed_currency, billing_interval,
                effective_from, effective_to, usage_limit, version
           FROM eper_application_addon_entitlement
          WHERE tenant_id = $1 AND application_id = $2 AND addon_key = $3`,
        [input.tenantId, input.applicationId, input.addonKey],
      );
      return result.rows[0] ? mapEntitlement(result.rows[0]) : null;
    });
  }

  async getStatus(addonKey: string): Promise<"draft" | "active" | "deprecated" | "disabled" | null> {
    if (!addonKey?.trim() || addonKey.length > 128) throw new Error("APPLICATION_ADDON_KEY_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ status: unknown }>(
        "SELECT status FROM eper_module_catalog WHERE module_key = $1", [addonKey],
      );
      const status = result.rows[0]?.status;
      if (status === undefined) return null;
      if (status !== "draft" && status !== "active" && status !== "deprecated" && status !== "disabled") {
        throw new Error("APPLICATION_ADDON_CATALOGUE_STATUS_INVALID");
      }
      return status;
    } finally { client.release(); }
  }
}
