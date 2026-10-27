import { createRequire } from "node:module";
import type { SqlPool } from "./postgres-payment-store.js";

export interface PostgresPoolHandle extends SqlPool {
  end(): Promise<void>;
}

/**
 * Construct the actual PostgreSQL runtime pool from deployment configuration.
 * No fallback database or implicit local credentials are permitted.
 *
 * Pool size is per process. Deployment operators must budget:
 * (API replicas × EPER_PG_POOL_MAX) + worker pools + migration/admin reserve
 * <= the database's usable connection limit.
 */
export function createPostgresPaymentPool(
  env: NodeJS.ProcessEnv = process.env,
): PostgresPoolHandle {
  const connectionString = env.EPER_PAYMENT_DATABASE_URL ?? env.DATABASE_URL ?? "";
  if (!connectionString.trim()) {
    throw new Error("EPER_PAYMENT_DATABASE_URL_REQUIRED");
  }
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("EPER_PAYMENT_DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("EPER_PAYMENT_DATABASE_URL_INVALID");
  }

  const readBoundedInteger = (name: string, fallback: number, minimum: number, maximum: number): number => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    if (!/^[0-9]+$/.test(raw.trim())) throw new Error(name + "_INVALID");
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new Error(name + "_OUT_OF_RANGE");
    }
    return value;
  };
  const max = readBoundedInteger("EPER_PG_POOL_MAX", 10, 1, 50);
  const connectionTimeoutMillis = readBoundedInteger("EPER_PG_CONNECTION_TIMEOUT_MS", 5_000, 500, 30_000);
  const idleTimeoutMillis = readBoundedInteger("EPER_PG_IDLE_TIMEOUT_MS", 30_000, 1_000, 300_000);
  const statementTimeout = readBoundedInteger("EPER_PG_STATEMENT_TIMEOUT_MS", 15_000, 500, 120_000);
  const queryTimeout = readBoundedInteger("EPER_PG_QUERY_TIMEOUT_MS", 20_000, 500, 120_000);
  const lockTimeout = readBoundedInteger("EPER_PG_LOCK_TIMEOUT_MS", 5_000, 100, 60_000);
  const idleInTransactionTimeout = readBoundedInteger("EPER_PG_IDLE_IN_TRANSACTION_TIMEOUT_MS", 10_000, 500, 120_000);

  const require = createRequire(import.meta.url);
  const pg = require("pg") as {
    Pool: new (options: {
      connectionString: string;
      max: number;
      idleTimeoutMillis: number;
      connectionTimeoutMillis: number;
      statement_timeout: number;
      query_timeout: number;
      lock_timeout: number;
      idle_in_transaction_session_timeout: number;
      application_name: string;
    }) => PostgresPoolHandle;
  };
  return new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    statement_timeout: statementTimeout,
    query_timeout: queryTimeout,
    lock_timeout: lockTimeout,
    idle_in_transaction_session_timeout: idleInTransactionTimeout,
    application_name: "eper-api",
  });
}
