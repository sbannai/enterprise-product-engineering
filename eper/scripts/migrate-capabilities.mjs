import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(here, "../packages/capabilities/migrations");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required. Migrations are intended for local development/integration databases only.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
  try {
    const files = (await readdir(migrationsDirectory))
      .filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    if (files.length === 0) throw new Error("CAPABILITY_MIGRATIONS_NOT_FOUND");
    for (const file of files) {
      await pool.query(await readFile(resolve(migrationsDirectory, file), "utf8"));
      console.log(`Applied EPER capability persistence migration ${file}.`);
    }
  } catch (error) {
    console.error("Capability persistence migration failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
