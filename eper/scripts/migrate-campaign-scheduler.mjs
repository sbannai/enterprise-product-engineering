#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "../migrate-payments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const connectionString = [
  process.env.EPER_CAMPAIGN_SCHEDULER_DATABASE_URL,
  process.env.EPER_AUDIT_DATABASE_URL,
  process.env.EPER_PAYMENT_DATABASE_URL,
  process.env.DATABASE_URL,
].find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";

if (!connectionString.trim()) {
  console.error("EPER_CAMPAIGN_SCHEDULER_DATABASE_URL_REQUIRED");
  process.exitCode = 1;
} else {
  await runMigrations(connectionString, {
    directory: join(here, "..", "packages", "campaign-scheduler", "migrations"),
    lockName: "eper:campaign-scheduler-schema-migrations",
    ledgerTable: "eper_campaign_scheduler_schema_migrations",
    applicationName: "eper-campaign-scheduler-migrations",
  });
}
