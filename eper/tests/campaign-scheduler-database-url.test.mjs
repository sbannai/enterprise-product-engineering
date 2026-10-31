import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { selectCampaignSchedulerDatabaseUrl } from "../scripts/select-campaign-scheduler-database-url.mjs";

test("scheduler-specific database URL takes precedence and is trimmed", () => {
  assert.equal(selectCampaignSchedulerDatabaseUrl({
    EPER_CAMPAIGN_SCHEDULER_DATABASE_URL: "  postgres://scheduler  ",
    EPER_AUDIT_DATABASE_URL: "postgres://audit",
    DATABASE_URL: "postgres://default",
  }), "postgres://scheduler");
});

test("blank higher-priority values fall through to the first usable URL", () => {
  assert.equal(selectCampaignSchedulerDatabaseUrl({
    EPER_CAMPAIGN_SCHEDULER_DATABASE_URL: "   ",
    EPER_AUDIT_DATABASE_URL: "",
    EPER_PAYMENT_DATABASE_URL: " postgres://payments ",
    DATABASE_URL: "postgres://default",
  }), "postgres://payments");
});

test("missing and non-string values produce an empty URL", () => {
  assert.equal(selectCampaignSchedulerDatabaseUrl({
    EPER_CAMPAIGN_SCHEDULER_DATABASE_URL: null,
    EPER_AUDIT_DATABASE_URL: 42,
    EPER_PAYMENT_DATABASE_URL: undefined,
    DATABASE_URL: "  ",
  }), "");
});

test("audit database URL wins over payment and generic database URLs", () => {
  assert.equal(selectCampaignSchedulerDatabaseUrl({
    EPER_CAMPAIGN_SCHEDULER_DATABASE_URL: " ",
    EPER_AUDIT_DATABASE_URL: " postgres://audit ",
    EPER_PAYMENT_DATABASE_URL: "postgres://payments",
    DATABASE_URL: "postgres://default",
  }), "postgres://audit");
});

test("generic database URL is the final fallback", () => {
  assert.equal(selectCampaignSchedulerDatabaseUrl({
    EPER_CAMPAIGN_SCHEDULER_DATABASE_URL: "",
    EPER_AUDIT_DATABASE_URL: " ",
    EPER_PAYMENT_DATABASE_URL: null,
    DATABASE_URL: " postgres://default ",
  }), "postgres://default");
});

test("migration runner fails closed when no database URL is configured", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const script = resolve(here, "../scripts/migrate-campaign-scheduler.mjs");
  const env = { ...process.env };
  for (const key of [
    "EPER_CAMPAIGN_SCHEDULER_DATABASE_URL",
    "EPER_AUDIT_DATABASE_URL",
    "EPER_PAYMENT_DATABASE_URL",
    "DATABASE_URL",
  ]) {
    delete env[key];
  }

  const result = spawnSync(process.execPath, [script], {
    cwd: resolve(here, ".."),
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EPER_CAMPAIGN_SCHEDULER_DATABASE_URL_REQUIRED/);
});
