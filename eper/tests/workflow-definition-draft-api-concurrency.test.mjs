import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const unusedWorkflowExecutionService = {
  async start() { throw new Error("workflow execution is not exercised by draft API tests"); },
  async transition() { throw new Error("workflow execution is not exercised by draft API tests"); },
};

test("Customer Admin draft API returns HTTP 409 for a stale concurrent editor save without overwriting the newer revision", async () => {
  const keys = [
    "EPER_WORKFLOW_EXECUTION_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "workflow-draft-stale-save-test-token-00000001";
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "admin-a", roleKey: "customer_admin" },
  });

  const definition = (name) => ({
    id: "expense-approval", name, status: "DRAFT", activities: [{
      id: "submit", title: "Submit expense", type: "FORM", roleId: "requester",
      permission: "workflow:act", nextActivityIds: [], fields: [],
    }],
  });
  let current = {
    tenantId: "tenant-a", applicationId: "app-a", workflowId: "expense-approval",
    draftVersion: 1, definition: definition("Revision one"),
    createdAt: "2026-11-11T00:00:00.000Z", createdBy: "admin-a",
    updatedAt: "2026-11-11T00:00:00.000Z", updatedBy: "admin-a",
  };
  const replaceCalls = [];
  const workflowDefinitionDraftStore = {
    async list() { return [current]; },
    async get() { return current; },
    async replace(input) {
      replaceCalls.push(input);
      if (input.expectedVersion !== current.draftVersion) {
        throw new Error("WORKFLOW_DRAFT_VERSION_CONFLICT:" + current.draftVersion);
      }
      throw new Error("test setup expected a concurrent revision before this stale save");
    },
  };
  const server = createAppServer({
    tenantApplicationAssignmentStore: { async listActive() { return ["app-a"]; } },
    actorApplicationAssignmentStore: { async isAssigned() { return true; } },
    workflowRoleDefinitionStore: {
      async list() {
        return [{ roleId: "requester", name: "Requester", permissions: ["workflow:act"], status: "active", version: 1 }];
      },
    },
    workflowActorRoleAssignmentStore: {},
    workflowDefinitionPublisher: { async publish() { throw new Error("publish is not exercised"); } },
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
    const draftUrl = base + "/admin/applications/app-a/workflow-definitions/expense-approval/draft";

    const editorRead = await fetch(draftUrl, { headers });
    assert.equal(editorRead.status, 200);
    const editorSnapshot = await editorRead.json();
    assert.equal(editorSnapshot.data.draft.draftVersion, 1);

    // Simulate another editor committing revision 2 after this editor read revision 1.
    current = { ...current, draftVersion: 2, definition: definition("Revision two from another editor") };

    const staleSave = await fetch(draftUrl, {
      method: "PUT", headers,
      body: JSON.stringify({ definition: definition("Stale editor overwrite"), expectedVersion: 1 }),
    });
    assert.equal(staleSave.status, 409);
    const conflictBody = await staleSave.json();
    assert.equal(conflictBody.success, false);
    assert.equal(conflictBody.error.code, "WORKFLOW_DRAFT_VERSION_CONFLICT_2");
    assert.equal(replaceCalls.length, 1);
    assert.equal(replaceCalls[0].expectedVersion, 1);
    assert.equal(current.draftVersion, 2);
    assert.equal(current.definition.name, "Revision two from another editor");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
