import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresCampaignSchedulerWorkerPool } from "../dist/packages/campaign-scheduler/postgres-campaign-scheduler-worker-runtime.js";

test("campaign scheduler worker pool requires its dedicated database URL and never falls back", () => {
  assert.throws(
    () => createPostgresCampaignSchedulerWorkerPool({ DATABASE_URL: "postgres://fallback/db" }),
    /EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL_REQUIRED/,
  );
  assert.throws(
    () => createPostgresCampaignSchedulerWorkerPool({ EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL: "https://example.invalid/db" }),
    /EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL_INVALID/,
  );
});

test("campaign scheduler worker pool rejects malformed dedicated database URLs", () => {
  assert.throws(
    () => createPostgresCampaignSchedulerWorkerPool({ EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL: "not-a-url" }),
    /EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL_INVALID/,
  );
});
