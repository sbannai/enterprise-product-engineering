import assert from "node:assert/strict";
import test from "node:test";
import { PostgresPeripheralRoleAuthorizer } from "../dist/packages/peripherals/peripheral-authorization.js";

test("peripheral role authorizer checks current application-scoped grants", async () => {
  const calls = [];
  const authorizer = new PostgresPeripheralRoleAuthorizer({
    async listActiveRoleIds(...args) { calls.push(["roles", ...args]); return ["role-operator"]; },
    async hasPermission(...args) { calls.push(["permission", ...args]); return args.at(-1) === "peripheral.activate"; },
  });
  await authorizer.authorize({
    tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a", action: "peripheral.activate",
  });
  assert.deepEqual(calls[0], ["roles", "tenant-a", "app-a", "actor-a"]);
  assert.equal(calls[1].at(-1), "peripheral.activate");
});

test("missing role grants deny peripheral operations", async () => {
  const authorizer = new PostgresPeripheralRoleAuthorizer({
    async listActiveRoleIds() { return ["role-viewer"]; },
    async hasPermission() { return false; },
  });
  await assert.rejects(
    authorizer.authorize({
      tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a", action: "peripheral.activate",
    }),
    /EPER_PERIPHERAL_ACTION_FORBIDDEN/,
  );
});

test("authorization store failure fails closed", async () => {
  const authorizer = new PostgresPeripheralRoleAuthorizer({
    async listActiveRoleIds() { throw new Error("database unavailable"); },
    async hasPermission() { return true; },
  });
  await assert.rejects(
    authorizer.authorize({
      tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a", action: "peripheral.read",
    }),
    /EPER_PERIPHERAL_AUTHORIZATION_UNAVAILABLE/,
  );
});

test("invalid scope is rejected before role lookup", async () => {
  let called = false;
  const authorizer = new PostgresPeripheralRoleAuthorizer({
    async listActiveRoleIds() { called = true; return ["role"]; },
    async hasPermission() { return true; },
  });
  await assert.rejects(
    authorizer.authorize({
      tenantId: "tenant-a", applicationId: "", actorId: "actor-a", action: "peripheral.read",
    }),
    /EPER_PERIPHERAL_AUTHORIZATION_SCOPE_INVALID/,
  );
  assert.equal(called, false);
});
