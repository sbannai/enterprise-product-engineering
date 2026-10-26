import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, "../packages/capabilities/migrations/001_capability_persistence.sql");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required. This migration is intended for local development/integration databases only.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  try {
    const sql = await readFile(migrationPath, "utf8");
    await pool.query(sql);
    console.log("Applied EPER capability persistence migration 001_capability_persistence.");
  } catch (error) {
    console.error("Capability persistence migration failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
