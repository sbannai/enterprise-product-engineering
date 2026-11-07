import test from "node:test";
import assert from "node:assert/strict";
import { hasCustomerAssetUploadPermission } from "../dist/packages/assets/customer-asset-upload-authorization.js";

const identity = { tenantId: "tenant-01", actorId: "actor-01" };
const applicationId = "app-01";

test("upload authorization checks current application-scoped roles and grants only explicit permission", async () => {
  const calls = [];
  const store = {
    async listActiveRoleIds(...args) { calls.push(["roles", ...args]); return ["reader", "asset-manager"]; },
    async hasPermission(...args) { calls.push(["permission", ...args]); return args[3] === "asset-manager" && args[4] === "customer.asset.upload"; },
  };
  assert.equal(await hasCustomerAssetUploadPermission(identity, applicationId, store), true);
  assert.deepEqual(calls, [
    ["roles", "tenant-01", "app-01", "actor-01"],
    ["permission", "tenant-01", "app-01", "actor-01", "reader", "customer.asset.upload"],
    ["permission", "tenant-01", "app-01", "actor-01", "asset-manager", "customer.asset.upload"],
  ]);
});

test("upload authorization denies when no active role or no explicit upload permission exists", async () => {
  const noRoles = { listActiveRoleIds: async () => [], hasPermission: async () => assert.fail("must not check a role") };
  assert.equal(await hasCustomerAssetUploadPermission(identity, applicationId, noRoles), false);
  const noPermission = { listActiveRoleIds: async () => ["reader"], hasPermission: async () => false };
  assert.equal(await hasCustomerAssetUploadPermission(identity, applicationId, noPermission), false);
});

test("upload authorization rejects invalid scope before querying the store", async () => {
  let calls = 0;
  const store = { listActiveRoleIds: async () => { calls++; return ["admin"]; }, hasPermission: async () => true };
  assert.equal(await hasCustomerAssetUploadPermission(identity, "../other-app", store), false);
  assert.equal(await hasCustomerAssetUploadPermission({ tenantId: "", actorId: "actor-01" }, applicationId, store), false);
  assert.equal(calls, 0);
});

test("authorization store failures propagate and cannot become an allow decision", async () => {
  const store = { listActiveRoleIds: async () => { throw new Error("database unavailable"); }, hasPermission: async () => true };
  await assert.rejects(
    hasCustomerAssetUploadPermission(identity, applicationId, store),
    /database unavailable/,
  );
});
