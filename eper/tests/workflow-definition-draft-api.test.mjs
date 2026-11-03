import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const unusedWorkflowExecutionService = {
  async start() { throw new Error("workflow execution is not exercised by draft API tests"); },
  async transition() { throw new Error("workflow execution is not exercised by draft API tests"); },
};

test("Customer Admin draft API is application-scoped, version-checked and publishes immutable snapshots", async () => {
  const keys = [
    "EPER_WORKFLOW_EXECUTION_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "workflow-draft-customer-admin-test-token-00000001";
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "admin-a", roleKey: "customer_admin" },
  });

  let saved = null;
  const replaceCalls = [];
  const publishCalls = [];
  const workflowDefinitionDraftStore = {
    async list(tenantId, applicationId) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(applicationId, "app-a");
      return saved ? [saved] : [];
    },
    async get(tenantId, applicationId, workflowId) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(applicationId, "app-a");
      return saved?.workflowId === workflowId ? saved : null;
    },
    async replace(input) {
      replaceCalls.push(input);
      saved = {
        tenantId: input.tenantId, applicationId: input.applicationId, workflowId: input.workflowId,
        draftVersion: input.expectedVersion + 1, definition: input.definition,
        createdAt: "2026-11-02T00:00:00.000Z", createdBy: input.changedBy,
        updatedAt: "2026-11-02T00:00:00.000Z", updatedBy: input.changedBy,
      };
      return saved;
    },
  };
  const workflowRoleDefinitionStore = {
    async list(tenantId, applicationId) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(applicationId, "app-a");
      return [{ roleId: "requester", name: "Requester", permissions: ["workflow:act"], status: "active", version: 1 }];
    },
  };
  const workflowDefinitionPublisher = {
    async publish(context, definition) {
      publishCalls.push({ context, definition });
      return { workflowId: definition.id, definitionVersion: 3, definitionDigest: "a".repeat(64) };
    },
  };
  const server = createAppServer({
    tenantApplicationAssignmentStore: { async listActive() { return ["app-a"]; } },
    actorApplicationAssignmentStore: { async isAssigned() { return true; } },
    workflowRoleDefinitionStore,
    workflowActorRoleAssignmentStore: {},
    workflowDefinitionPublisher,
    workflowDefinitionDraftStore,
    workflowExecutionService: unusedWorkflowExecutionService,
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const base = "http://127.0.0.1:" + server.address().port;
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const listUrl = base + "/admin/applications/app-a/workflow-definitions";
    const listed = await fetch(listUrl, { headers });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.success, true);
    assert.deepEqual(listedBody.data.drafts, []);

    const definition = {
      id: "expense-approval", name: "Expense approval", status: "DRAFT", activities: [{
        id: "submit", title: "Submit expense", type: "FORM", roleId: "requester",
        permission: "workflow:act", nextActivityIds: [], fields: [],
      }],
    };
    const savedResponse = await fetch(base + "/admin/applications/app-a/workflow-definitions/expense-approval/draft", {
      method: "PUT", headers,
      body: JSON.stringify({ definition, expectedVersion: 0, changeReason: "Initial customer design" }),
    });
    assert.equal(savedResponse.status, 200);
    const savedBody = await savedResponse.json();
    assert.equal(savedBody.success, true);
    assert.equal(savedBody.data.draft.draftVersion, 1);
    assert.equal(replaceCalls.length, 1);
    assert.equal(replaceCalls[0].changedBy, "admin-a");
    assert.equal(replaceCalls[0].applicationId, "app-a");

    const published = await fetch(base + "/admin/applications/app-a/workflow-definitions/expense-approval/publish", {
      method: "POST", headers, body: "{}",
    });
    assert.equal(published.status, 201);
    const publishedBody = await published.json();
    assert.equal(publishedBody.success, true);
    assert.equal(publishedBody.data.published.definitionVersion, 3);
    assert.equal(publishCalls[0].definition.status, "ACTIVE");
    assert.equal(publishCalls[0].definition.id, "expense-approval");

    const otherApplication = await fetch(base + "/admin/applications/app-b/workflow-definitions", { headers });
    assert.equal(otherApplication.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Product Admin cannot use the Customer Admin workflow draft API", async () => {
  const keys = [
    "EPER_WORKFLOW_EXECUTION_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "workflow-draft-product-admin-test-token-00000001";
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "product-admin", roleKey: "product_admin" },
  });
  const server = createAppServer({
    // Keep the server's production dependency guard enabled while this test
    // proves that Product Admin is denied before any workflow store is used.
    tenantApplicationAssignmentStore: { async listActive() { return ["app-a"]; } },
    workflowRoleDefinitionStore: { async list() { return []; } },
    workflowActorRoleAssignmentStore: {},
    workflowDefinitionPublisher: { async publish() { throw new Error("must not publish"); } },
    workflowExecutionService: unusedWorkflowExecutionService,
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const response = await fetch("http://127.0.0.1:" + server.address().port +
      "/admin/applications/app-a/workflow-definitions", {
        headers: { authorization: "Bearer " + token },
      });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "CUSTOMER_ADMIN_ROLE_REQUIRED");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
