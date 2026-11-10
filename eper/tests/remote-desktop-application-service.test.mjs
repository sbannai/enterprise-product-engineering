import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationRemoteDesktopService } from "../dist/packages/remote-desktop/index.js";

const input = {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  environment: "uat", correlationId: "remote-service-test",
  endpointId: "endpoint-a", expiresAt: "2030-01-01T00:00:00.000Z",
};
function fixture({ entitlement = true, deniedAction = null, transport = undefined, endpointConsentVerifier = { async verify() { return true; } } } = {}) {
  const calls = [];
  const store = {
    async getEndpointId(value) { calls.push(["getEndpointId", value]); return "endpoint-a"; },
    async requestSession(value) { calls.push(["request", value]); return { status: "REQUESTED" }; },
    async acceptWithConsent(value) { calls.push(["accept", value]); return { status: "ACCEPTED", mode: value.grantedMode }; },
    async revokeConsent(value) { calls.push(["revoke", value]); if (value.stopTransport) await value.stopTransport({ tenantId: value.tenantId, applicationId: value.applicationId, sessionId: value.sessionId, endpointId: "endpoint-a", consentGrantId: "grant-a", mode: "VIEW_ONLY", correlationId: value.correlationId }); return { status: "REVOKED" }; },
    async startWithConsent(value) { calls.push(["start", value]); await value.startTransport({ tenantId: value.tenantId, applicationId: value.applicationId, sessionId: value.sessionId, endpointId: "endpoint-a", consentGrantId: "grant-a", mode: "VIEW_ONLY", correlationId: value.correlationId }); return { status: "ACTIVE" }; },
    async stopSession(value) { calls.push(["stop", value]); await value.stopTransport({ tenantId: value.tenantId, applicationId: value.applicationId, sessionId: value.sessionId, endpointId: "endpoint-a", consentGrantId: "grant-a", mode: "VIEW_ONLY", correlationId: value.correlationId }); return { status: "STOPPED" }; },
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
  return { service: new ApplicationRemoteDesktopService(capabilities, store, authorizer, transport, endpointConsentVerifier), calls };
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
    expectedVersion: 1, endpointProof: "signed-endpoint-proof", grantedMode: "VIEW_ONLY", consentExpiresAt: "2029-12-01T00:00:00.000Z",
  });
  assert.equal(result.mode, "VIEW_ONLY");
  assert.deepEqual(calls.filter(([kind]) => kind === "authorize").map(([, action]) => action),
    ["remote_desktop.consent.accept"]);
});

test("consent requires a bounded endpoint-signed proof before identity verification", async () => {
  const { service, calls } = fixture();
  await assert.rejects(() => service.acceptConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, grantedMode: "VIEW_ONLY", consentExpiresAt: "2029-12-01T00:00:00.000Z",
  }), /ENDPOINT_PROOF_INVALID/);
  assert.equal(calls.some(([kind]) => kind === "getEndpointId"), false);
});

test("paid entitlement is checked before endpoint identity lookup or verification", async () => {
  let verifierCalls = 0;
  const { service, calls } = fixture({
    entitlement: false,
    endpointConsentVerifier: { async verify() { verifierCalls++; return true; } },
  });
  await assert.rejects(() => service.acceptConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, endpointProof: "signed-endpoint-proof",
    grantedMode: "VIEW_ONLY", consentExpiresAt: "2029-12-01T00:00:00.000Z",
  }), /ADDON_NOT_ENTITLED/);
  assert.equal(calls.some(([kind]) => kind === "getEndpointId"), false);
  assert.equal(verifierCalls, 0);
  assert.equal(calls.some(([kind]) => kind === "accept"), false);
});

test("consent fails closed when endpoint identity verifier is not configured", async () => {
  const { service, calls } = fixture({ endpointConsentVerifier: null });
  await assert.rejects(() => service.acceptConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, endpointProof: "signed-endpoint-proof", grantedMode: "VIEW_ONLY", consentExpiresAt: "2029-12-01T00:00:00.000Z",
  }), /ENDPOINT_IDENTITY_VERIFIER_NOT_CONFIGURED/);
  assert.equal(calls.some(([kind]) => kind === "accept"), false);
});

test("consent rejects an endpoint identity that does not match the session", async () => {
  const { service, calls } = fixture({ endpointConsentVerifier: { async verify(value) {
    assert.equal(value.endpointId, "endpoint-a");
    assert.equal(value.sessionId, "123e4567-e89b-42d3-a456-426614174000");
    assert.equal(value.expectedVersion, 1);
    assert.equal(value.endpointProof, "signed-endpoint-proof");
    return false;
  } } });
  await assert.rejects(() => service.acceptConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, endpointProof: "signed-endpoint-proof", grantedMode: "VIEW_ONLY", consentExpiresAt: "2029-12-01T00:00:00.000Z",
  }), /ENDPOINT_IDENTITY_NOT_VERIFIED/);
  assert.equal(calls.some(([kind]) => kind === "accept"), false);
});

test("remote control requires a separate explicit grant permission", async () => {
  const { service, calls } = fixture({ deniedAction: "remote_desktop.control.grant" });
  await assert.rejects(() => service.acceptConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, endpointProof: "signed-endpoint-proof", grantedMode: "REMOTE_CONTROL", consentExpiresAt: "2029-12-01T00:00:00.000Z",
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

test("consent revocation shuts down an active transport through the configured adapter", async () => {
  const transportCalls = [];
  const configured = fixture({ transport: {
    async start() {},
    async stop(context) { transportCalls.push(context.sessionId); },
  } });
  const result = await configured.service.revokeConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000", expectedVersion: 3,
  });
  assert.equal(result.status, "REVOKED");
  assert.deepEqual(transportCalls, ["123e4567-e89b-42d3-a456-426614174000"]);
  assert.ok(configured.calls.some(([kind, action]) => kind === "authorize" && action === "remote_desktop.consent.revoke"));
});

test("consent revocation without a transport remains fail-closed for active sessions", async () => {
  const configured = fixture();
  await configured.service.revokeConsent({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000", expectedVersion: 3,
  });
  // The persistence layer receives no stop callback and rejects ACTIVE sessions;
  // this service-level fake returns a result, so assert the callback is absent.
  const revoke = configured.calls.find(([kind]) => kind === "revoke");
  assert.equal(revoke[1].stopTransport, undefined);
});

test("start requires a configured transport and separate lifecycle permission", async () => {
  const noTransport = fixture();
  await assert.rejects(() => noTransport.service.startSession({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000", expectedVersion: 2,
  }), /TRANSPORT_NOT_CONFIGURED/);
  assert.equal(noTransport.calls.some(([kind]) => kind === "start"), false);

  const transportCalls = [];
  const configured = fixture({ transport: {
    async start(context, signal) { transportCalls.push(["start", context, signal.aborted]); },
    async stop(context) { transportCalls.push(["stop", context]); },
  } });
  const result = await configured.service.startSession({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000", expectedVersion: 2,
  });
  assert.equal(result.status, "ACTIVE");
  assert.deepEqual(transportCalls.map(([kind]) => kind), ["start"]);
  assert.ok(configured.calls.some(([kind, action]) => kind === "authorize" && action === "remote_desktop.session.start"));
});

test("stop requires lifecycle permission and delegates disconnect to the configured transport", async () => {
  const transportCalls = [];
  const configured = fixture({ transport: {
    async start() {},
    async stop(context) { transportCalls.push(context.sessionId); },
  } });
  const result = await configured.service.stopSession({
    ...input, sessionId: "123e4567-e89b-42d3-a456-426614174000", expectedVersion: 3,
  });
  assert.equal(result.status, "STOPPED");
  assert.deepEqual(transportCalls, ["123e4567-e89b-42d3-a456-426614174000"]);
});
