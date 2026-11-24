import type { SqlPool } from "../payments/postgres-payment-store.js";

interface DatabaseIdentity {
  database_name: string;
  server_address: string | null;
  server_port: number | null;
  is_replica: boolean;
}

export interface PeripheralCatalogueDatabasePools {
  application: SqlPool;
  payment: SqlPool;
  admin?: SqlPool | null;
  read: SqlPool;
}

async function readDatabaseIdentity(pool: SqlPool): Promise<DatabaseIdentity> {
  const client = await pool.connect();
  try {
    const result = await client.query<DatabaseIdentity>(`
      SELECT
        current_database() AS database_name,
        inet_server_addr()::text AS server_address,
        inet_server_port() AS server_port,
        pg_is_in_recovery() AS is_replica
    `);
    const identity = result.rows[0];

    if (!identity || !identity.database_name ||
        !identity.server_address ||
        !Number.isInteger(identity.server_port) ||
        identity.is_replica !== false) {
      throw new Error("EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_UNVERIFIABLE");
    }

    return identity;
  } catch (error) {
    if (error instanceof Error &&
        error.message === "EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_UNVERIFIABLE") {
      throw error;
    }
    throw new Error("EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_UNVERIFIABLE");
  } finally {
    client.release();
  }
}

export async function assertPeripheralCatalogueDatabaseIdentity(
  pools: PeripheralCatalogueDatabasePools,
): Promise<void> {
  const entries: Array<[string, SqlPool]> = [
    ["application", pools.application],
    ["payment", pools.payment],
    ...(pools.admin ? [["admin", pools.admin] as [string, SqlPool]] : []),
    ["read", pools.read],
  ];

  const identities = await Promise.all(
    entries.map(async ([name, pool]) => [name, await readDatabaseIdentity(pool)] as const),
  );

  const baseline = identities[0][1];
  for (const [name, identity] of identities.slice(1)) {
    if (identity.database_name !== baseline.database_name ||
        identity.server_address !== baseline.server_address ||
        identity.server_port !== baseline.server_port) {
      throw new Error(`EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_MISMATCH_${name.toUpperCase()}`);
    }
  }
}
