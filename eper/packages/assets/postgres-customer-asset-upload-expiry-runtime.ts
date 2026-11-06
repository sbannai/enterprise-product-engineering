import { createRequire } from "node:module";
import type { PostgresPoolHandle } from "../payments/postgres-payment-runtime.js";

/**
 * Dedicated least-privilege pool for the upload-expiry process.
 * It intentionally has no DATABASE_URL or payment-pool fallback.
 */
export function createPostgresCustomerAssetUploadExpiryPool(
  env: NodeJS.ProcessEnv = process.env,
): PostgresPoolHandle {
  const connectionString = env.EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL ?? "";
  if (!connectionString.trim()) {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED");
  }
  let parsed: URL;
  try { parsed = new URL(connectionString); } catch {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID");
  }

  const boundedInteger = (name: string, fallback: number, minimum: number, maximum: number): number => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    if (!/^[0-9]+$/.test(raw.trim())) throw new Error(name + "_INVALID");
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new Error(name + "_OUT_OF_RANGE");
    }
    return value;
  };
  const max = boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX", 2, 1, 10);
  const connectionTimeoutMillis = boundedInteger(
    "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_CONNECTION_TIMEOUT_MS", 5_000, 500, 30_000,
  );
  const idleTimeoutMillis = boundedInteger(
    "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TIMEOUT_MS", 30_000, 1_000, 300_000,
  );
  const statementTimeout = boundedInteger(
    "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_STATEMENT_TIMEOUT_MS", 15_000, 500, 120_000,
  );
  const queryTimeout = boundedInteger(
    "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_QUERY_TIMEOUT_MS", 20_000, 500, 120_000,
  );
  const lockTimeout = boundedInteger(
    "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_LOCK_TIMEOUT_MS", 5_000, 100, 60_000,
  );
  const idleInTransactionTimeout = boundedInteger(
    "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_IN_TRANSACTION_TIMEOUT_MS", 10_000, 500, 120_000,
  );

  const require = createRequire(import.meta.url);
  const pg = require("pg") as {
    Pool: new (options: {
      connectionString: string; max: number; idleTimeoutMillis: number;
      connectionTimeoutMillis: number; statement_timeout: number; query_timeout: number;
      lock_timeout: number; idle_in_transaction_session_timeout: number; application_name: string;
    }) => PostgresPoolHandle;
  };
  return new pg.Pool({
    connectionString, max, idleTimeoutMillis, connectionTimeoutMillis,
    statement_timeout: statementTimeout, query_timeout: queryTimeout, lock_timeout: lockTimeout,
    idle_in_transaction_session_timeout: idleInTransactionTimeout,
    application_name: "eper-customer-asset-upload-expiry-worker",
  });
}
