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
  return value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function mapEntitlement(row: EntitlementRow): ApplicationAddonEntitlement {
  const usageLimit = typeof row.usage_limit === "string" ? JSON.parse(row.usage_limit) : row.usage_limit;
  if (!usageLimit || typeof usageLimit !== "object" || Array.isArray(usageLimit)) {
    throw new Error("APPLICATION_ADDON_USAGE_LIMIT_INVALID");
  }
  return {
    tenantId: row.tenant_id, applicationId: row.application_id, addonKey: row.addon_key,
    status: row.entitlement_status, priceId: row.price_id,
    acceptedPriceVersion: row.accepted_price_version === null ? null : Number(row.accepted_price_version),
    agreedAmount: row.agreed_amount === null ? null : String(row.agreed_amount),
    agreedCurrency: row.agreed_currency?.trim() ?? null, billingInterval: row.billing_interval,
    effectiveFrom: iso(row.effective_from), effectiveTo: iso(row.effective_to),
    usageLimit, version: Number(row.version),
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
      const result = await client.query<{ status: "draft" | "active" | "deprecated" | "disabled" }>(
        "SELECT status FROM eper_module_catalog WHERE module_key = $1", [addonKey],
      );
      return result.rows[0]?.status ?? null;
    } finally { client.release(); }
  }
}
