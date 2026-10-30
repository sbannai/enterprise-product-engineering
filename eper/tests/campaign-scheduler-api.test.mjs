import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const token = "campaign-api-test-token-with-at-least-32-characters";
const schedule = { id: "schedule-1", tenantId: "tenant-a", applicationId: "app-a", status: "scheduled" };

async function withServer(t, overrides = {}) {
  const saved = {
    EPER_CAMPAIGN_SCHEDULER_API_ENABLED: process.env.EPER_CAMPAIGN_SCHEDULER_API_ENABLED,
    EPER_CUSTOMER_ACCESS_IDENTITIES_JSON: process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON,
    EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON: process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON,
  };
  process.env.EPER_CAMPAIGN_SCHEDULER_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer-admin" },
    ["another-test-token-with-at-least-32-characters"]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer-admin" },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"], "tenant-b": ["app-b"] });
  const storeOverrides = overrides;
  const store = {
    async createSchedule(input) { return { ...schedule, ...input, id: "schedule-created", status: "draft", approvalStatus: "pending" }; },
    async approveAndSchedule(input) { return { ...schedule, ...input, status: "scheduled", approvalStatus: "approved" }; },
    async pauseOrCancel(input) { return { ...schedule, ...input, status: input.action === "pause" ? "paused" : "cancelled" }; },
    async listSchedules(input) { return input.tenantId === "tenant-a" && input.applicationId === "app-a" ? [schedule] : []; },
    async getSchedule(input) { return input.tenantId === "tenant-a" && input.applicationId === "app-a" && input.scheduleId === "schedule-1" ? schedule : null; },
    ...storeOverrides,
  };
  const server = createAppServer({ campaignSchedulerStore: store, tenantApplicationAssignmentStore: overrides.tenantApplicationAssignmentStore, actorApplicationAssignmentStore: overrides.actorApplicationAssignmentStore });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const address = server.address();
  return { base: `http://127.0.0.1:${address.port}`, store };
}

test("campaign schedule list requires authentication", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules");
  assert.equal(response.status, 401);
});

test("campaign schedule list is scoped and uses bounded pagination", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules?limit=10&offset=0", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.eper.v1+json" },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.data);
  assert.equal(body.data.schedules.length, 1);
  assert.equal(body.data.schedules[0].tenantId, "tenant-a");
});

test("campaign schedule list rejects invalid pagination", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules?limit=101", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 400);
});

test("campaign schedule detail hides applications not assigned to the caller", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-b/campaign-schedules/schedule-1", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 404);
});

test("campaign schedule detail returns 404 when the schedule is outside the tenant scope", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules/schedule-other", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 404);
});


test("campaign schedule creation creates a draft and returns a durable schedule ID", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/vnd.eper.v1+json" },
    body: JSON.stringify({ campaignId: "campaign-a", triggerType: "once", timezone: "Asia/Kolkata", scheduleDefinition: { at: "2030-01-01T10:00:00+05:30" } }),
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.data.scheduleId, "schedule-created");
  assert.equal(body.data.status, "draft");
  assert.equal(body.data.approvalStatus, "pending");
});

test("campaign schedule creation rejects missing required fields", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ campaignId: "campaign-a" }),
  });
  assert.equal(response.status, 400);
});


test("campaign approval requires a future timestamp and returns approved schedule", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules/schedule-1/approve", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/vnd.eper.v1+json" },
    body: JSON.stringify({ nextRunAt: "2030-01-01T10:00:00+05:30" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.schedule.status, "scheduled");
  assert.equal(body.data.schedule.approvalStatus, "approved");
});

test("campaign pause and cancel require authenticated tenant application assignment", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-b/campaign-schedules/schedule-1/cancel", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 404);
});

test("campaign lifecycle rejects non-approver roles", async (t) => {
  const { base } = await withServer(t);
  const limitedToken = "campaign-api-limited-role-token-32-characters";
  const original = process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [limitedToken]: { tenantId: "tenant-a", actorId: "actor-limited", roleKey: "teacher" },
  });
  t.after(() => { if (original === undefined) delete process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON; else process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = original; });
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules/schedule-1/pause", {
    method: "POST", headers: { authorization: `Bearer ${limitedToken}` },
  });
  assert.equal(response.status, 403);
});


test("campaign resume requires a new future run time and uses the approval path", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules/schedule-1/resume", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/vnd.eper.v1+json" },
    body: JSON.stringify({ nextRunAt: "2030-01-01T10:00:00+05:30" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.schedule.status, "scheduled");
  assert.equal(body.data.schedule.approvalStatus, "approved");
});


test("campaign resume rejects a timestamp that is no longer in the future", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules/schedule-1/resume", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ nextRunAt: "2020-01-01T10:00:00Z" }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "INVALID_NEXT_RUN_AT");
});


test("campaign cancellation returns explicit conflict when dispatch has already started", async (t) => {
  const { base } = await withServer(t, {
    async pauseOrCancel() { throw new Error("CAMPAIGN_DISPATCH_ALREADY_STARTED"); },
  });
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules/schedule-1/cancel", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.eper.v1+json" },
  });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, "CAMPAIGN_DISPATCH_ALREADY_STARTED");
});


test("campaign resume passes a distinct audit operation to the store", async (t) => {
  let captured;
  const { base } = await withServer(t, {
    async approveAndSchedule(input) {
      captured = input;
      return { ...schedule, status: "scheduled", approvalStatus: "approved" };
    },
  });
  const response = await fetch(base + "/customer/applications/app-a/campaign-schedules/schedule-1/resume", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ nextRunAt: "2030-01-01T10:00:00+05:30" }),
  });
  assert.equal(response.status, 200);
  assert.equal(captured.operation, "resume");
});

test("campaign schedule API uses durable tenant and actor assignment stores", async (t) => {
  const tenantApplicationAssignmentStore = {
    async listActive(tenantId) { assert.equal(tenantId, "tenant-a"); return ["app-a", "app-b"]; },
  };
  const actorApplicationAssignmentStore = {
    async isAssigned(tenantId, actorId, applicationId) {
      assert.deepEqual([tenantId, actorId, applicationId], ["tenant-a", "actor-a", "app-a"]);
      return true;
    },
  };
  const { base } = await withServer(t, { tenantApplicationAssignmentStore, actorApplicationAssignmentStore });
  delete process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON;
  const allowed = await fetch(base + "/customer/applications/app-a/campaign-schedules", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(allowed.status, 200);
  const denied = await fetch(base + "/customer/applications/app-b/campaign-schedules", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(denied.status, 404);
});
