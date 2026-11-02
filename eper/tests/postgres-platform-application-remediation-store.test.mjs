import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPlatformApplicationRemediationStore } from "../dist/packages/workflows/postgres-platform-application-remediation-store.js";

const principal = {
  platformActorId: "platform-operator-01",
  credentialId: "platform-key-01",
  permissions: ["application:remediate"],
};
const input = {
  principal, tenantId: "tenant-01", applicationId: "app-01",
  expectedAssignmentVersion: 4, reasonTicketReference: "INC-4821",
  idempotencyKey: "remediate-request-01", correlationId: "corr-4821",
  environment: "sandbox",
};

function fakePool({ failAudit = false, assignmentVersion = 4, customerStatus = "active" } = {}) {
  const calls = [];
  let updated = false;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT request_hash, result, completed_at/.test(sql)) return { rows: [] };
      if (/SELECT customer_status FROM eper_customer_account/.test(sql)) return { rows: [{ customer_status: customerStatus }] };
      if (/SELECT tenant_id, application_id, assignment_status, version/.test(sql)) {
        return { rows: [{ tenant_id: input.tenantId, application_id: input.applicationId, assignment_status: "active", version: assignmentVersion }] };
      }
      if (/UPDATE eper_tenant_application_assignment/.test(sql)) {
        updated = true;
        return { rows: [{ tenant_id: input.tenantId, application_id: input.applicationId, assignment_status: "revoked", version: assignmentVersion + 1 }] };
      }
      if (/SELECT COUNT\(\*\)::int AS active_count/.test(sql)) return { rows: [{ active_count: 2 }] };
      if (/LEFT JOIN eper_customer_tariff_assignment/.test(sql)) return { rows: [{
        customer_status: customerStatus, assignment_status: "active", tariff_effective: true,
        max_applications: 2, evaluated_at: "2026-11-02T09:00:00.000Z",
      }] };
      if (/INSERT INTO eper_platform_application_remediation_idempotency/.test(sql)) return { rows: [] };
      if (/UPDATE eper_platform_application_remediation_idempotency/.test(sql)) return { rows: [] };
      if (/SELECT last_event_hash FROM eper_audit_chain_head/.test(sql)) return { rows: [{ last_event_hash: null }] };
      if (failAudit && /INSERT INTO eper_audit_events/.test(sql)) throw new Error("audit write failed");
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { calls, pool: { async connect() { return client; } }, wasUpdated: () => updated };
}

test("platform remediation revokes exactly the selected assignment and returns post-mutation tariff state", async () => {
  const { calls, pool, wasUpdated } = fakePool();
  const result = await new PostgresPlatformApplicationRemediationStore(pool).remediate(input);
  assert.equal(result.assignmentStatus, "revoked");
  assert.equal(result.assignmentVersion, 5);
  assert.equal(result.activeApplicationCount, 2);
  assert.equal(result.tariffAccessState, "within_allowance");
  assert.equal(result.replayed, false);
  assert.equal(wasUpdated(), true);
  assert.ok(calls.some(call => /tenant_id=\$1 AND application_id=\$2/.test(call.sql) && /FOR UPDATE/.test(call.sql)));
  assert.ok(calls.some(call => /INSERT INTO eper_audit_events/.test(call.sql)));
  assert.ok(calls.some(call => call.sql === "COMMIT"));
});

test("platform remediation rejects a stale assignment version before mutation", async () => {
  const { calls, pool, wasUpdated } = fakePool({ assignmentVersion: 5 });
  await assert.rejects(() => new PostgresPlatformApplicationRemediationStore(pool).remediate(input),
    { message: "PLATFORM_APPLICATION_REMEDIATION_VERSION_CONFLICT" });
  assert.equal(wasUpdated(), false);
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
});

test("platform remediation rolls back assignment when append-only audit fails", async () => {
  const { calls, pool, wasUpdated } = fakePool({ failAudit: true });
  await assert.rejects(() => new PostgresPlatformApplicationRemediationStore(pool).remediate(input), /audit write failed/);
  assert.equal(wasUpdated(), true);
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => call.sql === "COMMIT"));
});

test("platform remediation requires its independent platform permission", async () => {
  const { calls, pool } = fakePool();
  await assert.rejects(() => new PostgresPlatformApplicationRemediationStore(pool).remediate({
    ...input, principal: { ...principal, permissions: ["customer_admin:recover"] },
  }), { message: "PLATFORM_APPLICATION_REMEDIATION_PERMISSION_DENIED" });
  assert.equal(calls.length, 0);
});

test("platform remediation requires a reason and expected assignment version", async () => {
  const { pool } = fakePool();
  await assert.rejects(() => new PostgresPlatformApplicationRemediationStore(pool).remediate({
    ...input, reasonTicketReference: " ",
  }), { message: "PLATFORM_APPLICATION_REMEDIATION_REASON_REQUIRED" });
  await assert.rejects(() => new PostgresPlatformApplicationRemediationStore(pool).remediate({
    ...input, expectedAssignmentVersion: 0,
  }), { message: "PLATFORM_APPLICATION_REMEDIATION_EXPECTED_VERSION_INVALID" });
});
