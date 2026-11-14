import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

async function withServer(run, { permission = true } = {}) {
  const keys = [
    "EPER_APPLICATION_DATA_MODEL_ADMIN_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "application-data-model-admin-test-token-00000001";
  process.env.EPER_APPLICATION_DATA_MODEL_ADMIN_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "admin-a", roleKey: "customer_admin" },
  });
  const calls = [];
  const server = createAppServer({
    tenantApplicationAssignmentStore: { async listActive(tenantId) {
      assert.equal(tenantId, "tenant-a"); return ["app-a"];
    } },
    actorApplicationAssignmentStore: { async isAssigned(...args) {
      assert.deepEqual(args, ["tenant-a", "admin-a", "app-a"]); return true;
    } },
    workflowActorRoleAssignmentStore: {
      async listActiveRoleIds(...args) { assert.deepEqual(args, ["tenant-a", "app-a", "admin-a"]); return ["role-a"]; },
      async hasPermission(...args) {
        assert.deepEqual(args, ["tenant-a", "app-a", "admin-a", "role-a", "workflow:admin"]);
        return permission;
      },
    },
    applicationDataModelAuthoringService: {
      async createDraft(context, input) { calls.push({ operation: "createDraft", context, input }); return { ...input, tenantId: context.tenantId, applicationId: context.applicationId, version: 2, status: "DRAFT" }; },
      async activate(context, entityType, version) { calls.push({ operation: "activate", context, entityType, version }); },
      async retire(context, entityType, version) { calls.push({ operation: "retire", context, entityType, version }); },
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

test("Customer Admin creates a model draft using server-derived scope and actor identity", async () => {
  await withServer(async (url, token, calls) => {
    const response = await fetch(url + "/admin/applications/app-a/application-data-models", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        entityType: "Order", expectedVersion: 1,
        fields: [{ id: "total", type: "number", required: true }],
        tenantId: "attacker-tenant", applicationId: "attacker-app", actorId: "attacker",
      }),
    });
    assert.equal(response.status, 400, "scope spoofing fields are rejected");
    assert.equal(calls.length, 0);
    const accepted = await fetch(url + "/admin/applications/app-a/application-data-models", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ entityType: "Order", expectedVersion: 1, fields: [{ id: "total", type: "number" }] }),
    });
    assert.equal(accepted.status, 201);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].context, {
      tenantId: "tenant-a", applicationId: "app-a", actorId: "admin-a", roleId: "role-a",
      correlationId: calls[0].context.correlationId, requirementId: "REQ-46301",
      environment: "sandbox", serviceVersion: undefined,
    });
    assert.equal(calls[0].input.entityType, "Order");
  });
});

test("application data model authoring denies a caller without workflow:admin", async () => {
  await withServer(async (url, token, calls) => {
    const response = await fetch(url + "/admin/applications/app-a/application-data-models", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ entityType: "Order", expectedVersion: 1, fields: [] }),
    });
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);
  }, { permission: false });
});

test("application data model activation and retirement route to the scoped authoring service", async () => {
  await withServer(async (url, token, calls) => {
    for (const [transition, status] of [["activate", "ACTIVE"], ["retire", "RETIRED"]]) {
      const response = await fetch(url + "/admin/applications/app-a/application-data-models/Order/2/" + transition, {
        method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: "{}",
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.status, status);
    }
    assert.deepEqual(calls.map(call => [call.operation, call.entityType, call.version]), [
      ["activate", "Order", 2], ["retire", "Order", 2],
    ]);
  });
});
