import test from "node:test";
import assert from "node:assert/strict";
import { runCampaignExecutionWorker } from "../dist/packages/campaign-scheduler/campaign-execution-worker.js";

test("worker fails closed and never calls provider when fresh dispatch authorization is denied", async () => {
  const controller = new AbortController();
  let claimed = false;
  let providerCalls = 0;
  let denied = null;
  const execution = {
    id: "exec-1", scheduleId: "schedule-1", tenantId: "tenant-a", applicationId: "app-a",
    scheduledFor: "2026-10-27T08:00:00.000Z", status: "running", attemptCount: 1,
    idempotencyKey: "campaign:schedule-1:run-1", payload: {}, availableAt: "2026-10-27T08:00:00.000Z",
  };
  const store = {
    async recoverStaleExecutions() {},
    async materializeDueOneTimeSchedules() {},
    async materializeDueRecurringSchedules() {},
    async claimExecutions() {
      if (claimed) return [];
      claimed = true;
      return [execution];
    },
    async failExecution(input) {
      denied = input;
      controller.abort();
      return "dead_letter";
    },
    async completeExecution() { throw new Error("must not complete denied execution"); },
  };
  await runCampaignExecutionWorker(
    store,
    async () => { providerCalls += 1; return { outcome: {} }; },
    {
      workerId: "test-worker",
      signal: controller.signal,
      idleDelayMs: 100,
      authorizeDispatch: async (claimedExecution) => {
        assert.equal(claimedExecution.id, "exec-1");
        return false;
      },
    },
  );
  assert.equal(providerCalls, 0);
  assert.equal(denied?.errorCode, "CAMPAIGN_DISPATCH_POLICY_DENIED");
  assert.equal(denied?.maxAttempts, 1);
});
