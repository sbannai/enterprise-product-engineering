import test from "node:test";
import assert from "node:assert/strict";
import {
  assertRemoteDesktopConsent,
  assertRemoteDesktopModeGrant,
  assertRemoteDesktopScope,
  transitionRemoteSession,
} from "../dist/packages/remote-desktop/index.js";

const session = (overrides = {}) => ({
  tenantId: "tenant-a",
  applicationId: "app-a",
  sessionId: "session-1",
  requesterId: "support-1",
  endpointId: "endpoint-1",
  status: "ACCEPTED",
  mode: "VIEW_ONLY",
  consentGrantId: "grant-1",
  expiresAt: "2030-01-01T00:00:00.000Z",
  version: 1,
  ...overrides,
});
const consent = (overrides = {}) => ({
  tenantId: "tenant-a",
  applicationId: "app-a",
  consentGrantId: "grant-1",
  sessionId: "session-1",
  endpointId: "endpoint-1",
  subjectId: "user-1",
  grantedMode: "VIEW_ONLY",
  grantedAt: "2029-01-01T00:00:00.000Z",
  expiresAt: "2030-01-01T00:00:00.000Z",
  revokedAt: null,
  ...overrides,
});

test("session lifecycle rejects restart from terminal states", () => {
  assert.equal(transitionRemoteSession("REQUESTED", "ACCEPTED"), "ACCEPTED");
  assert.equal(transitionRemoteSession("ACCEPTED", "ACTIVE"), "ACTIVE");
  assert.throws(() => transitionRemoteSession("STOPPED", "ACTIVE"), /INVALID_SESSION_TRANSITION/);
});

test("remote desktop consent must match tenant, application, endpoint and session", () => {
  assert.doesNotThrow(() => assertRemoteDesktopConsent({
    session: session(), consent: consent(), now: new Date("2029-06-01T00:00:00.000Z"),
  }));
  assert.throws(() => assertRemoteDesktopConsent({
    session: session({ applicationId: "app-b" }), consent: consent(),
    now: new Date("2029-06-01T00:00:00.000Z"),
  }), /EXPLICIT_CONSENT_REQUIRED/);
  assert.throws(() => assertRemoteDesktopConsent({
    session: session(), consent: consent({ endpointId: "endpoint-b" }),
    now: new Date("2029-06-01T00:00:00.000Z"),
  }), /EXPLICIT_CONSENT_REQUIRED/);
});

test("expired, revoked or not-yet-accepted sessions cannot start", () => {
  for (const [s, c] of [
    [session(), consent({ revokedAt: "2029-05-01T00:00:00.000Z" })],
    [session({ status: "REQUESTED" }), consent()],
    [session(), consent({ expiresAt: "2029-05-01T00:00:00.000Z" })],
  ]) {
    assert.throws(() => assertRemoteDesktopConsent({
      session: s, consent: c, now: new Date("2029-06-01T00:00:00.000Z"),
    }), /EXPLICIT_CONSENT_REQUIRED/);
  }
});

test("view-only consent cannot be escalated to remote control", () => {
  assert.throws(() => assertRemoteDesktopModeGrant("REMOTE_CONTROL", consent()), /CONTROL_CONSENT_REQUIRED/);
  assert.doesNotThrow(() => assertRemoteDesktopModeGrant("REMOTE_CONTROL", consent({ grantedMode: "REMOTE_CONTROL" })));
});

test("tenant and application scope mismatch is rejected", () => {
  assert.throws(() => assertRemoteDesktopScope(
    { tenantId: "tenant-a", applicationId: "app-a" },
    { tenantId: "tenant-a", applicationId: "app-b" },
  ), /APPLICATION_SCOPE_MISMATCH/);
});
