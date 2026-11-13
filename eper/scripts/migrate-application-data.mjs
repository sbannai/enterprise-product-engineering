#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate-payments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.EPER_APPLICATION_DATA_DATABASE_URL
  ?? process.env.EPER_WORKFLOW_DATABASE_URL
  ?? process.env.EPER_AUDIT_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? "";

if (!connectionString.trim()) {
  console.error("EPER_APPLICATION_DATA_DATABASE_URL_REQUIRED");
  process.exitCode = 1;
} else {
  await runMigrations(connectionString, {
    directory: join(here, "..", "packages", "application-data", "migrations"),
    lockName: "eper:application-data-schema-migrations",
    ledgerTable: "eper_application_data_schema_migrations",
    applicationName: "eper-application-data-migrations",
  });
}
