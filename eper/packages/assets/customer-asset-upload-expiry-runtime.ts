import { createRequire } from "node:module";
import type { AuditSqlPool } from "../audit/audit-event-store.js";

export interface CustomerAssetUploadExpiryPool extends AuditSqlPool {
  end(): Promise<void>;
}

function bounded(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^[0-9]+$/.test(raw.trim())) throw new Error(name + "_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(name + "_OUT_OF_RANGE");
  return value;
}

/** Strictly dedicated pool; never falls back to DATABASE_URL or payment credentials. */
export function createCustomerAssetUploadExpiryPool(env: NodeJS.ProcessEnv = process.env): CustomerAssetUploadExpiryPool {
  const connectionString = env.EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL ?? "";
  if (!connectionString.trim()) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED");
  let parsed: URL;
  try { parsed = new URL(connectionString); }
  catch { throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID"); }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID");
  }

  const max = bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX", 2, 1, 5);
  const connectionTimeoutMillis = bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_CONNECTION_TIMEOUT_MS", 5_000, 500, 30_000);
  const idleTimeoutMillis = bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TIMEOUT_MS", 10_000, 1_000, 60_000);
  const statement_timeout = bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_STATEMENT_TIMEOUT_MS", 15_000, 500, 60_000);
  const query_timeout = bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_QUERY_TIMEOUT_MS", 20_000, 500, 60_000);
  const lock_timeout = bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_LOCK_TIMEOUT_MS", 5_000, 100, 30_000);
  const idle_in_transaction_session_timeout = bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TX_TIMEOUT_MS", 10_000, 500, 60_000);

  const require = createRequire(import.meta.url);
  const pg = require("pg") as { Pool: new (options: Record<string, unknown>) => CustomerAssetUploadExpiryPool };
  return new pg.Pool({
    connectionString, max, connectionTimeoutMillis, idleTimeoutMillis,
    statement_timeout, query_timeout, lock_timeout, idle_in_transaction_session_timeout,
    application_name: "eper-customer-asset-upload-expiry-worker",
  });
}
