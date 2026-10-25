#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate-payments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.EPER_AUDIT_DATABASE_URL
  ?? process.env.EPER_PAYMENT_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? "";

if (!connectionString.trim()) {
  console.error("EPER_AUDIT_DATABASE_URL_REQUIRED");
  process.exitCode = 1;
} else {
  await runMigrations(connectionString, {
    directory: join(here, "..", "packages", "audit", "migrations"),
    lockName: "eper:audit-schema-migrations",
    applicationName: "eper-audit-migrations",
  });
}
