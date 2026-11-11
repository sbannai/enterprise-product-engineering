import type { AuditSqlPool } from "../audit/audit-event-store.js";
import { PostgresProviderConnectionRepository } from "./postgres-provider-connection-repository.js";
import { PostgresTenantProviderDefaultsRepository } from "./postgres-tenant-provider-defaults-repository.js";
import { ProviderDispatchConfigurationService } from "./provider-dispatch-configuration-service.js";

/**
 * Builds the PostgreSQL-backed dispatch resolver using one explicitly supplied
 * least-privilege provider-catalogue pool for both binding and policy reads.
 * The caller owns pool lifecycle and must validate its role/grants at startup.
 */
export function createPostgresProviderDispatchConfigurationService(pool: AuditSqlPool): ProviderDispatchConfigurationService {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("PROVIDER_DISPATCH_POSTGRES_POOL_REQUIRED");
  }
  const connections = new PostgresProviderConnectionRepository(pool);
  const policies = new PostgresTenantProviderDefaultsRepository(pool);
  return new ProviderDispatchConfigurationService(connections, policies);
}
