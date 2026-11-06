#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate-payments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.EPER_WORKFLOW_DATABASE_URL
  ?? process.env.EPER_AUDIT_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? "";

if (!connectionString.trim()) {
  console.error("EPER_WORKFLOW_DATABASE_URL_REQUIRED");
  process.exitCode = 1;
} else {
  await runMigrations(connectionString, {
    directory: join(here, "..", "packages", "workflows", "migrations"),
    lockName: "eper:workflow-schema-migrations",
    ledgerTable: "eper_workflow_schema_migrations",
    applicationName: "eper-workflow-migrations",
  });
}
