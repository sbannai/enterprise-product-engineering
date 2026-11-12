import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import type { SqlClient, SqlPool } from "./postgres-payment-store.js";

export interface PostgresPoolMetrics {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  connectAttempts: number;
  connectFailures: number;
  inFlightAcquisitions: number;
  acquisitionDurationTotalMs: number;
  acquisitionDurationMaxMs: number;
}

/** Aggregate, low-cardinality pool snapshot; contains no SQL, credentials or tenant data. */
export type PostgresPoolConnectCallback = (
  error: Error | undefined,
  client: SqlClient | undefined,
  release: (error?: Error | boolean) => void,
) => void;

export interface PostgresPoolHandle extends SqlPool {
  /** Promise acquisition remains the application-facing structural contract. */
  connect(): Promise<SqlClient>;
  /** Preserve node-postgres' callback overload because Pool.query() uses it internally. */
  connect(callback: PostgresPoolConnectCallback): void;
  end(): Promise<void>;
  snapshotMetrics(): PostgresPoolMetrics;
}

interface ObservablePgPool extends PostgresPoolHandle {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
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
  applicationName = "eper-api",
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
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    statement_timeout: statementTimeout,
    query_timeout: queryTimeout,
    lock_timeout: lockTimeout,
    idle_in_transaction_session_timeout: idleInTransactionTimeout,
    application_name: applicationName,
  }) as ObservablePgPool;

  // Preserve both node-postgres connect overloads. Pool.query() calls connect(callback)
  // internally, so replacing connect with a Promise-only wrapper would leave queries
  // waiting forever. Measure callback and Promise acquisitions without changing either API.
  let connectAttempts = 0;
  let connectFailures = 0;
  let inFlightAcquisitions = 0;
  let acquisitionDurationTotalMs = 0;
  let acquisitionDurationMaxMs = 0;
  const acquire = pool.connect.bind(pool) as {
    (): Promise<SqlClient>;
    (callback: PostgresPoolConnectCallback): void;
  };
  const recordAcquisition = (startedAt: number, failed: boolean): void => {
    if (failed) connectFailures += 1;
    const elapsed = Math.max(0, performance.now() - startedAt);
    acquisitionDurationTotalMs += elapsed;
    acquisitionDurationMaxMs = Math.max(acquisitionDurationMaxMs, elapsed);
    inFlightAcquisitions = Math.max(0, inFlightAcquisitions - 1);
  };
  pool.connect = ((callback?: PostgresPoolConnectCallback) => {
    connectAttempts += 1;
    inFlightAcquisitions += 1;
    const startedAt = performance.now();

    if (typeof callback === "function") {
      try {
        return acquire((error, client, release) => {
          recordAcquisition(startedAt, Boolean(error));
          callback(error, client, release);
        });
      } catch (error) {
        recordAcquisition(startedAt, true);
        throw error;
      }
    }

    let pending: Promise<SqlClient>;
    try {
      pending = acquire();
    } catch (error) {
      recordAcquisition(startedAt, true);
      throw error;
    }
    return pending.then(
      (client) => {
        recordAcquisition(startedAt, false);
        return client;
      },
      (error: unknown) => {
        recordAcquisition(startedAt, true);
        throw error;
      },
    );
  }) as ObservablePgPool["connect"];
  pool.snapshotMetrics = () => ({
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    connectAttempts,
    connectFailures,
    inFlightAcquisitions,
    acquisitionDurationTotalMs: Number(acquisitionDurationTotalMs.toFixed(3)),
    acquisitionDurationMaxMs: Number(acquisitionDurationMaxMs.toFixed(3)),
  });
  return pool;
}
