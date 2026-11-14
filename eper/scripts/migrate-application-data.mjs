import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required. Application data migrations are for local development/integration databases only.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  try {
    const sql = await readFile(resolve(here, "../packages/application-data/migrations/001_application_data.sql"), "utf8");
    await pool.query(sql);
    console.log("Applied application data migration 001.");
  } catch (error) {
    console.error("Application data migration failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally { await pool.end(); }
}
