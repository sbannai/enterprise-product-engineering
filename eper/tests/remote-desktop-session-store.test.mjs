import assert from "node:assert/strict";
import test from "node:test";
import { PostgresRemoteDesktopSessionStore } from "../dist/packages/remote-desktop/index.js";

function fixture() {
  const calls = [];
  let session = null;
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
      if (sql.includes("SELECT tenant_id, application_id, session_id, requester_id")) {
        return { rows: session ? [{ ...session }] : [], rowCount: session ? 1 : 0 };
      }
      if (sql.includes("UPDATE eper_remote_desktop_session")) {
        session = { ...session, status: values[3] === "REMOTE_CONTROL" || values[3] === "VIEW_ONLY" ? "ACCEPTED" : "REVOKED",
          ...(values[3] === "REMOTE_CONTROL" || values[3] === "VIEW_ONLY" ? { mode: values[3], consent_grant_id: values[4] } : {}),
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
