import type { AuditSqlClient } from "../audit/audit-event-store.js";

export type PeripheralCatalogueLockMode = "shared" | "exclusive";

export async function acquirePeripheralCatalogueTypeLock(
  client: AuditSqlClient,
  typeKey: string,
  mode: PeripheralCatalogueLockMode,
): Promise<void> {
  const lockFunction = mode === "shared"
    ? "pg_advisory_xact_lock_shared"
    : "pg_advisory_xact_lock";

  await client.query(
    `SELECT ${lockFunction}(hashtextextended($1, 230023))`,
    [typeKey],
  );
}
