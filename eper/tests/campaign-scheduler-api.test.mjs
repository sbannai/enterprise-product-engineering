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
  const store = {
    async createSchedule(input) { return { ...schedule, ...input, id: "schedule-created", status: "draft", approvalStatus: "pending" }; },
    async approveAndSchedule(input) { return { ...schedule, ...input, status: "scheduled", approvalStatus: "approved" }; },
    async pauseOrCancel(input) { return { ...schedule, ...input, status: input.action === "pause" ? "paused" : "cancelled" }; },
    async listSchedules(input) { return input.tenantId === "tenant-a" && input.applicationId === "app-a" ? [schedule] : []; },
    async getSchedule(input) { return input.tenantId === "tenant-a" && input.applicationId === "app-a" && input.scheduleId === "schedule-1" ? schedule : null; },
    ...overrides,
  };
  const server = createAppServer({ campaignSchedulerStore: store });
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
  assert.equal(response.headers.get("allow"), null, "successful creation must not fall through to the method-not-allowed handler");
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

test("campaign schedule console serves responsive UI and lifecycle controls", async (t) => {
  const { base } = await withServer(t);
  const response = await fetch(base + "/customer/campaign-schedules-ui");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const html = await response.text();
  assert.match(html, /name="viewport"/);
  assert.match(html, /Create schedule draft/);
  assert.match(html, /Load schedules/);
  assert.match(html, /\/customer\/applications\//);
  assert.match(html, /Approve/);
  assert.match(html, /Pause/);
  assert.match(html, /Resume/);
  assert.match(html, /Cancel/);
  assert.match(html, /configuredOnceAt/);
  assert.match(html, /<option value="once">Once<\/option><option value="recurring">Recurring<\/option>/);
  assert.doesNotMatch(html, /<option value="event">|<option value="condition">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Execution diagnostics/);
  assert.match(html, /id="executionId"/);
  assert.match(html, /Load diagnostics/);
  assert.match(html, /campaign-executions/);
  assert.match(html, /lastErrorDetailCode/);
});

test("campaign schedule creation rejects trigger types without verified execution paths", async (t) => {
  const { base } = await withServer(t);
  for (const triggerType of ["event", "condition"]) {
    const response = await fetch(base + "/customer/applications/app-a/campaign-schedules", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        campaignId: "campaign-a",
        triggerType,
        timezone: "Asia/Kolkata",
        scheduleDefinition: { at: "2030-01-01T10:00:00+05:30" },
      }),
    });
    assert.equal(response.status, 400, `${triggerType} trigger must fail closed until its execution path is implemented`);
  }
});


test("execution diagnostics require operator role and return only tenant-scoped error details", async (t) => {
  let captured;
  const diagnostic = {
    executionId: "execution-a", scheduleId: "schedule-a", status: "dead_letter", attemptCount: 2,
    lastErrorCode: "DISPATCH_OUTCOME_UNKNOWN",
    lastErrorDetailCode: "CAMPAIGN_EXECUTION_COMPLETION_LEASE_LOST",
    dispatchStartedAt: "2030-01-01T10:00:00.000Z",
    completedAt: "2030-01-01T10:00:05.000Z",
    updatedAt: "2030-01-01T10:00:05.000Z",
  };
  const { base } = await withServer(t, {
    async getExecutionDiagnostics(input) {
      captured = input;
      return diagnostic;
    },
  });
  const response = await fetch(base + "/customer/applications/app-a/campaign-executions/execution-a", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.eper.v1+json" },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.execution, diagnostic);
  assert.deepEqual(captured, { tenantId: "tenant-a", applicationId: "app-a", executionId: "execution-a" });
});

test("execution diagnostics fail closed in durable assignment mode until durable authorization is wired", async (t) => {
  const original = process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE;
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  t.after(() => {
    if (original === undefined) delete process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE;
    else process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = original;
  });
  let reads = 0;
  const { base } = await withServer(t, {
    async getExecutionDiagnostics() { reads += 1; return null; },
  });
  const response = await fetch(base + "/customer/applications/app-a/campaign-executions/execution-a", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.eper.v1+json" },
  });
  assert.equal(response.status, 503);
  assert.equal(reads, 0, "diagnostic lookup must not run without durable actor/application authorization");
});

test("execution diagnostics hide unassigned applications and reject non-operator roles", async (t) => {
  let reads = 0;
  const { base } = await withServer(t, {
    async getExecutionDiagnostics() { reads += 1; return null; },
  });
  const wrongApplication = await fetch(base + "/customer/applications/app-b/campaign-executions/execution-a", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(wrongApplication.status, 404);
  const limitedToken = "campaign-api-limited-role-token-32-characters";
  const original = process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [limitedToken]: { tenantId: "tenant-a", actorId: "actor-limited", roleKey: "teacher" },
  });
  t.after(() => { if (original === undefined) delete process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON; else process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = original; });
  const forbidden = await fetch(base + "/customer/applications/app-a/campaign-executions/execution-a", {
    headers: { authorization: `Bearer ${limitedToken}` },
  });
  assert.equal(forbidden.status, 403);
  assert.equal(reads, 0, "authorization must be enforced before execution lookup");
});
