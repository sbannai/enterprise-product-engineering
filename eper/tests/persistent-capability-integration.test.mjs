import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { AuthoritativeRecordService, AuthorizationService, AuditEvidenceService, ExceptionHandlingService, GovernedReportingService } from "../dist/packages/capabilities/index.js";
import { JsonFileAuthoritativeRecordStore } from "../dist/packages/capabilities/json-file-authoritative-record-store.js";
import { JsonFileAuthorizationPolicyStore } from "../dist/packages/capabilities/json-file-authorization-policy-store.js";
import { JsonFileAuditEvidenceStore } from "../dist/packages/capabilities/json-file-audit-evidence-store.js";
import { JsonFileExceptionStore } from "../dist/packages/capabilities/json-file-exception-store.js";
import { JsonFileGovernedReportingStore } from "../dist/packages/capabilities/json-file-governed-reporting-store.js";

const requirement = pattern => requirementBindings.find(row => row.pattern === pattern);
const context = { tenantId: "persist-integration-tenant", principalId: "persist-integration-user", correlationId: "persist-integration-correlation" };
const occurredAt = "2026-10-09T00:00:00.000Z";

test("persistent adapters are injectable into the five stateful capability services", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eper-persistent-capabilities-"));
  try {
    const recordFile = join(dir, "records.json");
    const record = requirement("XX01");
    const recordStore = new JsonFileAuthoritativeRecordStore(recordFile);
    const recordService = new AuthoritativeRecordService(recordStore);
    await recordService.execute(record, { context, payload: { operation: "create", record: {
      id: "persisted-record", tenantId: context.tenantId, version: 1, state: "OPEN", data: { source: record.id },
    } } });
    assert.equal(new AuthoritativeRecordService(new JsonFileAuthoritativeRecordStore(recordFile)).getRecord(context.tenantId, "persisted-record")?.data.source, record.id);

    const policyFile = join(dir, "policies.json");
    const policyStore = new JsonFileAuthorizationPolicyStore(policyFile);
    policyStore.addPolicy({ tenantId: context.tenantId, principalId: context.principalId, actions: ["read"], resources: [record.id], effect: "ALLOW" });
    const authResult = await new AuthorizationService(new JsonFileAuthorizationPolicyStore(policyFile)).execute(requirement("XX02"), {
      context, payload: { operation: "decide", request: { tenantId: context.tenantId, principalId: context.principalId, action: "read", resource: record.id } },
    });
    assert.equal(authResult.data.payload.decision.effect, "ALLOW");

    const auditFile = join(dir, "audit.json");
    const auditStore = new JsonFileAuditEvidenceStore(auditFile);
    const auditReq = requirement("XX04");
    const auditService = new AuditEvidenceService(auditStore);
    const auditResult = await auditService.execute(auditReq, { context, payload: { operation: "append", evidence: {
      id: "persisted-audit", tenantId: context.tenantId, requirementId: auditReq.id, action: "PERSISTENCE_INTEGRATION",
      principalId: context.principalId, correlationId: context.correlationId, occurredAt, payload: { source: auditReq.id },
    } } });
    const auditEntry = auditResult.data.payload.evidence;
    const reopenedAudit = new JsonFileAuditEvidenceStore(auditFile);
    assert.equal(reopenedAudit.verify(auditEntry), true);
    assert.equal(reopenedAudit.get(context.tenantId, "persisted-audit")?.integrityHash, auditEntry.integrityHash);

    const exceptionFile = join(dir, "exception-state.json");
    const exceptionStore = new JsonFileExceptionStore(exceptionFile);
    const exceptionReq = requirement("XX05");
    const exceptionService = new ExceptionHandlingService(exceptionStore, exceptionStore);
    await exceptionService.execute(exceptionReq, { context, payload: { operation: "create", exception: {
      id: "persisted-exception", tenantId: context.tenantId, requirementId: exceptionReq.id, code: "PERSISTENCE_INTEGRATION",
      message: "Verify exception state and audit evidence", idempotencyKey: "persisted-exception-idem", createdAt: occurredAt,
    } } });
    await exceptionService.execute(exceptionReq, { context, payload: { operation: "transition", tenantId: context.tenantId, id: "persisted-exception", patch: { state: "RETRYING" } } });
    const reopenedExceptionStore = new JsonFileExceptionStore(exceptionFile);
    const reopenedExceptionService = new ExceptionHandlingService(reopenedExceptionStore, reopenedExceptionStore);
    assert.equal(reopenedExceptionService.getException(context.tenantId, "persisted-exception")?.state, "RETRYING");
    const lifecycle = reopenedExceptionService.listLifecycleEvidence(context.tenantId, exceptionReq.id);
    assert.equal(lifecycle.length, 2);
    assert.equal(lifecycle.every(entry => reopenedExceptionService.verifyLifecycleEvidence(entry)), true);

    const reportFile = join(dir, "reports.json");
    const reportStore = new JsonFileGovernedReportingStore(reportFile);
    const reportReq = requirement("XX06");
    const reportService = new GovernedReportingService(reportStore);
    await reportService.execute(reportReq, { context, payload: { operation: "publish", row: {
      tenantId: context.tenantId, reportId: "persisted-report", values: { source: reportReq.id, status: "PASS" },
      sourceRequirementIds: [reportReq.id], generatedAt: occurredAt,
    } } });
    const reportResult = await new GovernedReportingService(new JsonFileGovernedReportingStore(reportFile)).execute(reportReq, {
      context, payload: { operation: "query", request: { tenantId: context.tenantId, reportId: "persisted-report", filters: { status: "PASS" } } },
    });
    assert.equal(reportResult.data.payload.rows.length, 1);
    assert.deepEqual(reportResult.data.payload.rows[0].sourceRequirementIds, [reportReq.id]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
