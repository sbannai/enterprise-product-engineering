import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationRemoteDesktopService } from "../dist/packages/remote-desktop/index.js";

const input = {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  environment: "uat", correlationId: "remote-service-test",
  endpointId: "endpoint-a", expiresAt: "2030-01-01T00:00:00.000Z",
};
function fixture({ entitlement = true, deniedAction = null } = {}) {
  const calls = [];
  const store = {
    async requestSession(value) { calls.push(["request", value]); return { status: "REQUESTED" }; },
    async acceptWithConsent(value) { calls.push(["accept", value]); return { status: "ACCEPTED", mode: value.grantedMode }; },
    async revokeConsent(value) { calls.push(["revoke", value]); return { status: "REVOKED" }; },
  };
  const capabilities = {
    async withRemoteDesktopSharing(scope, operation) {
      calls.push(["entitlement", scope]);
      if (!entitlement) throw new Error("ADDON_NOT_ENTITLED");
      return operation({ addonKey: "remote_desktop_sharing" });
    },
  };
  const authorizer = {
    async authorize(value) {
      calls.push(["authorize", value.action]);
      if (value.action === deniedAction) throw new Error("ACTION_NOT_AUTHORIZED");
    },
  };
  return { service: new ApplicationRemoteDesktopService(capabilities, store, authorizer), calls };
}

test("request requires actor authorization and paid application entitlement", async () => {
  const { service, calls } = fixture({ entitlement: false });
  await assert.rejects(() => service.requestSession(input), /ADDON_NOT_ENTITLED/);
  assert.ok(calls.some(([kind]) => kind === "authorize"));
  assert.equal(calls.some(([kind]) => kind === "request"), false);
});

test("view-only consent requires acceptance permission but not remote-control grant", async () => {
  const { service, calls } = fixture();
  const result = await service.acceptConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, grantedMode: "VIEW_ONLY", consentExpiresAt: "2029-12-01T00:00:00.000Z",
  });
  assert.equal(result.mode, "VIEW_ONLY");
  assert.deepEqual(calls.filter(([kind]) => kind === "authorize").map(([, action]) => action),
    ["remote_desktop.consent.accept"]);
});

test("remote control requires a separate explicit grant permission", async () => {
  const { service, calls } = fixture({ deniedAction: "remote_desktop.control.grant" });
  await assert.rejects(() => service.acceptConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, grantedMode: "REMOTE_CONTROL", consentExpiresAt: "2029-12-01T00:00:00.000Z",
  }), /ACTION_NOT_AUTHORIZED/);
  assert.equal(calls.some(([kind]) => kind === "accept"), false);
});

test("revocation is authorized before entitlement or persistence", async () => {
  const { service, calls } = fixture({ deniedAction: "remote_desktop.consent.revoke" });
  await assert.rejects(() => service.revokeConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000", expectedVersion: 2,
  }), /ACTION_NOT_AUTHORIZED/);
  assert.equal(calls.some(([kind]) => kind === "revoke"), false);
});
