import { createRequire } from "node:module";
import type { SqlPool } from "../payments/postgres-payment-store.js";

export interface CustomerAssetUploadExpiryPool extends SqlPool {
  end(): Promise<void>;
}
export interface CustomerAssetUploadExpiryPoolOptions {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statement_timeout: number;
  query_timeout: number;
  lock_timeout: number;
  idle_in_transaction_session_timeout: number;
  application_name: string;
}
type PoolConstructor = new (options: CustomerAssetUploadExpiryPoolOptions) => CustomerAssetUploadExpiryPool;

function bounded(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^[0-9]+$/.test(raw.trim())) throw new Error(name + "_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(name + "_OUT_OF_RANGE");
  return value;
}

/** Build a pool that can only use the dedicated upload-expiry worker login. */
export function createCustomerAssetUploadExpiryPool(
  env: NodeJS.ProcessEnv = process.env,
  Pool?: PoolConstructor,
): CustomerAssetUploadExpiryPool {
  const connectionString = env.EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED");
  let parsed: URL;
  try { parsed = new URL(connectionString); }
  catch { throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID"); }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID");
  }
  let PoolType = Pool;
  if (!PoolType) {
    const require = createRequire(import.meta.url);
    const pg = require("pg") as { Pool: PoolConstructor };
    PoolType = pg.Pool;
  }
  return new PoolType({
    connectionString,
    max: bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX", 2, 1, 5),
    connectionTimeoutMillis: bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_CONNECTION_TIMEOUT_MS", 5_000, 500, 30_000),
    idleTimeoutMillis: bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TIMEOUT_MS", 10_000, 1_000, 60_000),
    statement_timeout: bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_STATEMENT_TIMEOUT_MS", 15_000, 500, 120_000),
    query_timeout: bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_QUERY_TIMEOUT_MS", 20_000, 500, 120_000),
    lock_timeout: bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_LOCK_TIMEOUT_MS", 5_000, 100, 60_000),
    idle_in_transaction_session_timeout: bounded(env, "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TRANSACTION_TIMEOUT_MS", 10_000, 500, 120_000),
    application_name: "eper-customer-asset-upload-expiry-worker",
  });
}
