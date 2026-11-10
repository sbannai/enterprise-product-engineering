import assert from "node:assert/strict";
import test from "node:test";
import { PostgresRemoteDesktopSessionStore } from "../dist/packages/remote-desktop/index.js";

function fixture() {
  const calls = [];
  let session = null;
  let consent = null;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO eper_remote_desktop_session")) {
        session = {
          tenant_id: values[0], application_id: values[1], session_id: values[2],
          requester_id: values[3], endpoint_id: values[4], status: "REQUESTED",
          mode: "VIEW_ONLY", consent_grant_id: null, expires_at: values[5], version: 1,
        };
        return { rows: [session], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO eper_remote_desktop_consent")) {
        consent = { endpoint_id: values[4], granted_mode: values[6], expires_at: values[7], revoked_at: null };
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("JOIN eper_remote_desktop_consent")) {
        return { rows: session && consent ? [{ ...session, consent_endpoint_id: consent.endpoint_id,
          consent_mode: consent.granted_mode, consent_expires_at: consent.expires_at,
          consent_revoked_at: consent.revoked_at }] : [], rowCount: session && consent ? 1 : 0 };
      }
      if (sql.includes("SELECT tenant_id, application_id, session_id, requester_id")) {
        return { rows: session ? [{ ...session }] : [], rowCount: session ? 1 : 0 };
      }
      if (sql.includes("UPDATE eper_remote_desktop_session")) {
        const status = sql.includes("status='ACTIVE'") ? "ACTIVE"
          : sql.includes("'REVOKED'") ? "REVOKED"
          : sql.includes("status='STOPPED'") ? "STOPPED"
          : sql.includes("status='ACCEPTED'") ? "ACCEPTED" : "REVOKED";
        session = { ...session, status,
          ...(status === "ACCEPTED" ? { mode: values[3], consent_grant_id: values[4] } : {}),
          version: session.version + 1 };
        return { rows: [session], rowCount: 1 };
      }
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const store = new PostgresRemoteDesktopSessionStore({ async connect() { return client; } });
  return { store, calls };
}
const scope = {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "endpoint-user",
  environment: "uat", correlationId: "remote-session-test",
};

test("request creates a view-only session with tenant/application transaction scope and audit", async () => {
  const { store, calls } = fixture();
  const result = await store.requestSession({
    ...scope, endpointId: "endpoint-a", expiresAt: "2030-01-01T00:00:00.000Z",
    sessionId: "123e4567-e89b-42d3-a456-426614174000",
  });
  assert.equal(result.status, "REQUESTED");
  assert.equal(result.mode, "VIEW_ONLY");
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.tenant_id'")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some(call => call.sql === "COMMIT"));
});

test("consent acceptance persists a separate grant and does not silently enable control", async () => {
  const { store, calls } = fixture();
  await store.requestSession({
    ...scope, endpointId: "endpoint-a", expiresAt: "2030-01-01T00:00:00.000Z",
    sessionId: "123e4567-e89b-42d3-a456-426614174000",
  });
  const accepted = await store.acceptWithConsent({
    ...scope, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, grantedMode: "VIEW_ONLY", consentExpiresAt: "2029-12-01T00:00:00.000Z",
    consentGrantId: "123e4567-e89b-42d3-a456-426614174001",
  });
  assert.equal(accepted.status, "ACCEPTED");
  assert.equal(accepted.mode, "VIEW_ONLY");
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_remote_desktop_consent")));
  assert.ok(calls.some(call => call.sql.includes("UPDATE eper_remote_desktop_session")));
});

test("consent cannot outlive its session and invalid scope is rejected", async () => {
  const { store } = fixture();
  await assert.rejects(() => store.requestSession({
    ...scope, applicationId: "x", endpointId: "endpoint-a",
    expiresAt: "2030-01-01T00:00:00.000Z",
  }), /INVALID_APPLICATIONID/);
  await store.requestSession({
    ...scope, endpointId: "endpoint-a", expiresAt: "2029-06-01T00:00:00.000Z",
    sessionId: "123e4567-e89b-42d3-a456-426614174000",
  });
  await assert.rejects(() => store.acceptWithConsent({
    ...scope, sessionId: "123e4567-e89b-42d3-a456-426614174000",
    expectedVersion: 1, grantedMode: "REMOTE_CONTROL", consentExpiresAt: "2029-12-01T00:00:00.000Z",
  }), /CONSENT_EXCEEDS_SESSION_EXPIRY/);
});

test("start revalidates endpoint consent under row lock", async () => {
  const { store, calls } = fixture();
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  await store.requestSession({ ...scope, endpointId: "endpoint-a", expiresAt: "2030-01-01T00:00:00.000Z", sessionId });
  await store.acceptWithConsent({ ...scope, sessionId, expectedVersion: 1, grantedMode: "VIEW_ONLY",
    consentExpiresAt: "2029-12-01T00:00:00.000Z", consentGrantId: "123e4567-e89b-42d3-a456-426614174001" });
  let started = 0;
  const active = await store.startWithConsent({ ...scope, sessionId, expectedVersion: 2,
    async startTransport(context) { started++; assert.equal(context.mode, "VIEW_ONLY");
      assert.equal(context.endpointId, "endpoint-a"); return async () => {}; } });
  assert.equal(started, 1);
  assert.equal(active.status, "ACTIVE");
  assert.ok(calls.some(call => call.sql.includes("FOR UPDATE OF s, c")));
});

test("consent revocation disconnects an active transport before revoking the grant", async () => {
  const { store, calls } = fixture();
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  await store.requestSession({ ...scope, endpointId: "endpoint-a", expiresAt: "2030-01-01T00:00:00.000Z", sessionId });
  await store.acceptWithConsent({ ...scope, sessionId, expectedVersion: 1, grantedMode: "VIEW_ONLY",
    consentExpiresAt: "2029-12-01T00:00:00.000Z", consentGrantId: "123e4567-e89b-42d3-a456-426614174001" });
  await store.startWithConsent({ ...scope, sessionId, expectedVersion: 2,
    async startTransport() { return async () => {}; } });
  let disconnected = 0;
  const revoked = await store.revokeConsent({ ...scope, sessionId, expectedVersion: 3,
    async stopTransport(context) {
      disconnected++;
      assert.equal(context.sessionId, sessionId);
      assert.equal(context.endpointId, "endpoint-a");
      assert.equal(context.mode, "VIEW_ONLY");
    } });
  assert.equal(disconnected, 1);
  assert.equal(revoked.status, "REVOKED");
  assert.ok(calls.some(call => call.sql.includes("UPDATE eper_remote_desktop_consent SET revoked_at")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
});

test("active consent revocation fails closed without a configured transport", async () => {
  const { store } = fixture();
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  await store.requestSession({ ...scope, endpointId: "endpoint-a", expiresAt: "2030-01-01T00:00:00.000Z", sessionId });
  await store.acceptWithConsent({ ...scope, sessionId, expectedVersion: 1, grantedMode: "VIEW_ONLY",
    consentExpiresAt: "2029-12-01T00:00:00.000Z" });
  await store.startWithConsent({ ...scope, sessionId, expectedVersion: 2,
    async startTransport() { return async () => {}; } });
  await assert.rejects(() => store.revokeConsent({ ...scope, sessionId, expectedVersion: 3 }),
    /TRANSPORT_NOT_CONFIGURED/);
});

test("stop disconnects before persisting STOPPED and supports a safe retry", async () => {
  const { store } = fixture();
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  await store.requestSession({ ...scope, endpointId: "endpoint-a", expiresAt: "2030-01-01T00:00:00.000Z", sessionId });
  await store.acceptWithConsent({ ...scope, sessionId, expectedVersion: 1, grantedMode: "VIEW_ONLY",
    consentExpiresAt: "2029-12-01T00:00:00.000Z" });
  await store.startWithConsent({ ...scope, sessionId, expectedVersion: 2, async startTransport() { return async () => {}; } });
  let stopped = 0;
  const result = await store.stopSession({ ...scope, sessionId, expectedVersion: 3,
    async stopTransport(context) { stopped++; assert.equal(context.mode, "VIEW_ONLY"); } });
  assert.equal(result.status, "STOPPED");
  const retry = await store.stopSession({ ...scope, sessionId, expectedVersion: 3, async stopTransport() { stopped++; } });
  assert.equal(retry.status, "STOPPED");
  assert.equal(stopped, 1);
});
