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
      const version = file.replace(/\.sql$/, "");
      const { rows: tableRows } = await pool.query(
        "SELECT to_regclass('public.eper_schema_migrations') AS migration_table",
      );
      if (tableRows[0]?.migration_table) {
        const applied = await pool.query(
          "SELECT 1 FROM eper_schema_migrations WHERE version = $1",
          [version],
        );
        if (applied.rowCount) {
          console.log(`Skipping already applied capability migration ${version}.`);
          continue;
        }
      }

      await pool.query(await readFile(resolve(migrationsDirectory, file), "utf8"));
      console.log(`Applied EPER capability persistence migration ${version}.`);
    }
  } catch (error) {
    console.error("Capability persistence migration failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
