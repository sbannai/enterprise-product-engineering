import { createRequire } from "node:module";
import type { SqlPool } from "./postgres-payment-store.js";

export interface PostgresPoolHandle extends SqlPool {
  end(): Promise<void>;
}

/**
 * Construct the actual PostgreSQL runtime pool from deployment configuration.
 * No fallback database or implicit local credentials are permitted.
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

  const require = createRequire(import.meta.url);
  const pg = require("pg") as {
    Pool: new (options: {
      connectionString: string;
      max: number;
      idleTimeoutMillis: number;
      connectionTimeoutMillis: number;
      application_name: string;
    }) => PostgresPoolHandle;
  };
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "eper-api-payments",
  });
}
