#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const migrationDirectory = join(here, "..", "packages", "payments", "migrations");
const connectionString = process.env.EPER_PAYMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!connectionString.trim()) {
    console.error("EPER_PAYMENT_DATABASE_URL_REQUIRED");
    process.exitCode = 1;
  } else {
    await runMigrations(connectionString);
  }
}

export async function runMigrations(connectionString, options = {}) {
  const require = createRequire(import.meta.url);
  const { Client } = require("pg");
  const client = new Client({
    connectionString,
    application_name: options.applicationName ?? "eper-payment-migrations",
    connectionTimeoutMillis: 5_000,
  });
  const directory = options.directory ?? migrationDirectory;
  const lockName = options.lockName ?? "eper:payment-schema-migrations";
  let lockAcquired = false;

  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockName]);
    lockAcquired = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS eper_payment_schema_migrations (
        migration_name TEXT PRIMARY KEY,
        sha256 CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const names = (await readdir(directory))
      .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
      .sort();

    if (names.length === 0) throw new Error("EPER_PAYMENT_MIGRATIONS_NOT_FOUND");

    for (const name of names) {
      const sql = await readFile(join(directory, name), "utf8");
      const digest = createHash("sha256").update(sql).digest("hex");
      const prior = await client.query(
        "SELECT sha256 FROM eper_payment_schema_migrations WHERE migration_name = $1",
        [name],
      );

      if (prior.rowCount) {
        if (prior.rows[0].sha256.trim() !== digest) {
          throw new Error(`EPER_PAYMENT_MIGRATION_CHECKSUM_MISMATCH:${name}`);
        }
        continue;
      }

      // Migration files retain their standalone BEGIN/COMMIT wrappers for direct
      // psql use. Strip only those outer wrappers so schema changes and the ledger
      // insert commit atomically when run through this deploy-time runner.
      const body = sql
        .replace(/(^|\n)\s*BEGIN\s*;?/i, "$1")
        .replace(/\s*COMMIT\s*;?\s*$/i, "");

      await client.query("BEGIN");
      try {
        await client.query(body);
        await client.query(
          "INSERT INTO eper_payment_schema_migrations (migration_name, sha256) VALUES ($1, $2)",
          [name, digest],
        );
        await client.query("COMMIT");
        console.log(`applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockName]);
      } catch {
        // Closing the session releases the advisory lock even if unlock fails.
      }
    }
    await client.end();
  }
}
