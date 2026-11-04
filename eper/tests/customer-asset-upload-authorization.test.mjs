import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCustomerAssetUploadAuthorizer } from "../dist/packages/assets/customer-asset-upload-authorization.js";
import { WORKFLOW_ROLE_PERMISSIONS } from "../dist/packages/workflows/postgres-workflow-role-definition-store.js";

test("customer asset upload authorization requires the active application role permission", async () => {
  const calls = [];
  const authorizer = new PostgresCustomerAssetUploadAuthorizer({
    async listActiveRoleIds(tenantId, applicationId, actorId) {
      assert.deepEqual([tenantId, applicationId, actorId], ["tenant-a", "app-a", "actor-a"]);
      return ["customer-viewer", "asset-manager"];
    },
    async hasPermission(tenantId, applicationId, actorId, roleId, permission) {
      calls.push({ tenantId, applicationId, actorId, roleId, permission });
      return roleId === "asset-manager" && permission === "customer.asset.upload";
    },
  });
  assert.equal(await authorizer.authorize({ tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a" }), true);
  assert.deepEqual(calls.map(call => [call.roleId, call.permission]), [
    ["customer-viewer", "customer.asset.upload"],
    ["asset-manager", "customer.asset.upload"],
  ]);
});

test("customer asset upload authorization denies actors with no permitted application role", async () => {
  const authorizer = new PostgresCustomerAssetUploadAuthorizer({
    async listActiveRoleIds() { return []; },
    async hasPermission() { throw new Error("must not query a missing role"); },
  });
  assert.equal(await authorizer.authorize({ tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a" }), false);
});

test("customer asset upload authorization fails closed when durable role lookup fails", async () => {
  const authorizer = new PostgresCustomerAssetUploadAuthorizer({
    async listActiveRoleIds() { throw new Error("database unavailable"); },
    async hasPermission() { return true; },
  });
  await assert.rejects(
    authorizer.authorize({ tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a" }),
    /database unavailable/,
  );
});

test("durable role definitions expose the customer asset upload permission", () => {
  assert.ok(WORKFLOW_ROLE_PERMISSIONS.includes("customer.asset.upload"));
});
