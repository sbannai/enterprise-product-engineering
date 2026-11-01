import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

async function withServer(run, { permission = true } = {}) {
  const keys = [
    "EPER_WORKFLOW_OUTBOX_ADMIN_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "workflow-outbox-admin-test-token-00000000000001";
  process.env.EPER_WORKFLOW_OUTBOX_ADMIN_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "admin-a" },
  });
  const calls = { list: [], replay: [] };
  const server = createAppServer({
    tenantApplicationAssignmentStore: { async listActive(tenantId) {
      assert.equal(tenantId, "tenant-a"); return ["app-a"];
    } },
    actorApplicationAssignmentStore: { async isAssigned(...args) {
      assert.deepEqual(args, ["tenant-a", "admin-a", "app-a"]); return true;
    } },
    workflowActorRoleAssignmentStore: {
      async listActiveRoleIds(...args) { assert.deepEqual(args, ["tenant-a", "app-a", "admin-a"]); return ["operator"]; },
      async hasPermission(...args) {
        assert.deepEqual(args, ["tenant-a", "app-a", "admin-a", "operator", "workflow:admin"]);
        return permission;
      },
    },
    workflowOutboxStore: { async listDeadLetters(context, limit) {
      calls.list.push({ context, limit });
      return [{ event: { eventId: EVENT_ID }, lastError: "provider timeout", updatedAt: "2026-11-01T00:00:00.000Z" }];
    } },
    workflowOutboxReplay: async (pool, context, input) => {
      calls.replay.push({ pool, context, input });
      return { replayId: "replay-1", eventId: input.eventId, priorAttempts: 8, alreadyApplied: false };
    },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    await run("http://127.0.0.1:" + address.port, token, calls);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("workflow outbox dead-letter list requires trusted identity and workflow admin permission", async () => {
  await withServer(async (url, token, calls) => {
    const path = url + "/admin/applications/app-a/workflow-outbox/dead-letters?limit=25";
    assert.equal((await fetch(path)).status, 401);
    const deniedServer = null;
    const response = await fetch(path, { headers: { authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.deadLetters[0].event.eventId, EVENT_ID);
    assert.deepEqual(calls.list, [{
      context: { tenantId: "tenant-a", applicationId: "app-a" }, limit: 25,
    }]);
    assert.equal(deniedServer, null);
  });
});

test("workflow outbox dead-letter inspection denies users without workflow:admin", async () => {
  await withServer(async (url, token, calls) => {
    const response = await fetch(url + "/admin/applications/app-a/workflow-outbox/dead-letters", {
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(response.status, 403);
    assert.equal(calls.list.length, 0);
  }, { permission: false });
});

test("workflow outbox replay requires reason and idempotency and submits no provider dispatch", async () => {
  await withServer(async (url, token, calls) => {
    const path = url + "/admin/applications/app-a/workflow-outbox/dead-letters/" + EVENT_ID + "/replay";
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const invalid = await fetch(path, { method: "POST", headers, body: JSON.stringify({ reason: "retry" }) });
    assert.equal(invalid.status, 400);
    assert.equal(calls.replay.length, 0);
    const response = await fetch(path, { method: "POST", headers, body: JSON.stringify({
      reason: "Provider credentials were rotated and verified.",
      idempotencyKey: "dead-letter-replay-key-0001",
    }) });
    assert.equal(response.status, 202);
    assert.equal(calls.replay.length, 1);
    assert.equal(calls.replay[0].context.tenantId, "tenant-a");
    assert.equal(calls.replay[0].context.applicationId, "app-a");
    assert.equal(calls.replay[0].context.actorId, "admin-a");
    assert.equal(calls.replay[0].input.eventId, EVENT_ID);
    assert.match(calls.replay[0].input.workerId, /^operator-/);
    assert.equal(calls.replay[0].input.reason, "Provider credentials were rotated and verified.");
    assert.equal(calls.replay[0].input.idempotencyKey, "dead-letter-replay-key-0001");
  });
});
