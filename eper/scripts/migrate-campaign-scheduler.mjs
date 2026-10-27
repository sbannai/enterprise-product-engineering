#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "../migrate-payments.mjs";
import { selectCampaignSchedulerDatabaseUrl } from "./select-campaign-scheduler-database-url.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const connectionString = selectCampaignSchedulerDatabaseUrl();

if (!connectionString) {
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
