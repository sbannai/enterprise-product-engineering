import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import {
  AuthoritativeRecordService,
  AuthorizationService,
  BusinessValidationService,
  AuditEvidenceService,
  ExceptionHandlingService,
  GovernedReportingService,
} from "../dist/packages/capabilities/services.js";

const req = (id) => {
  const r = requirementBindings.find((x) => x.id === id);
  assert.ok(r, `Missing governed requirement: ${id}`);
  return r;
};
const ctx = (id) => ({ tenantId: "wave-03-ch465", principalId: "wave-03-runner", correlationId: id });

test("REQ-46501 / SRS-FR-2335: authoritative lifecycle and version control", async () => {
  const r = req("REQ-46501"); assert.equal(r.pattern, "XX01");
  const s = new AuthoritativeRecordService();
  await s.execute(r, { context: ctx("46501-create"), payload: { operation: "create", record: { id: "46501-record", tenantId: "wave-03-ch465", version: 1, state: "OPEN", data: { source: "wave-03" } } } });
  const u = await s.execute(r, { context: ctx("46501-update"), payload: { operation: "update", tenantId: "wave-03-ch465", id: "46501-record", expectedVersion: 1, patch: { state: "CLOSED" } } });
  assert.equal(u.data.payload.record.version, 2);
  assert.equal(u.data.payload.record.state, "CLOSED");
  assert.throws(() => s.execute(r, { context: ctx("46501-stale"), payload: { operation: "update", tenantId: "wave-03-ch465", id: "46501-record", expectedVersion: 1, patch: { state: "REOPENED" } } }), /RECORD_VERSION_CONFLICT/);
});

test("REQ-46502 / SRS-FR-2336: authorization deny precedence and default deny", async () => {
  const r = req("REQ-46502"); assert.equal(r.pattern, "XX02");
  const s = new AuthorizationService();
  const d = await s.execute(r, { context: ctx("46502-deny"), payload: { operation: "decide", request: { tenantId: "wave-03-ch465", principalId: "actor-46502", action: "material.update", resource: "authoritative-record" }, policies: [{ tenantId: "wave-03-ch465", principalId: "actor-46502", actions: ["material.update"], resources: ["authoritative-record"], effect: "ALLOW" }, { tenantId: "wave-03-ch465", principalId: "actor-46502", actions: ["material.update"], resources: ["authoritative-record"], effect: "DENY" }] } });
  assert.equal(d.data.payload.decision.effect, "DENY");
  const dd = await s.execute(r, { context: ctx("46502-default"), payload: { operation: "decide", request: { tenantId: "wave-03-ch465", principalId: "unlisted", action: "material.delete", resource: "authoritative-record" } } });
  assert.equal(dd.data.payload.decision.effect, "DENY");
});

test("REQ-46503 / SRS-FR-2337: mandatory business validation", async () => {
  const r = req("REQ-46503"); assert.equal(r.pattern, "XX03");
  const s = new BusinessValidationService();
  s.addRule({ id: "46503-positive-amount", evaluate: (input) => input?.amount > 0 ? null : { code: "MANDATORY_CONDITION_FAILED", message: "Amount must be positive", severity: "ERROR" } });
  const v = await s.execute(r, { context: ctx("46503-valid"), payload: { operation: "validate", input: { amount: 100 } } });
  assert.equal(v.data.payload.validation.valid, true);
  const i = await s.execute(r, { context: ctx("46503-invalid"), payload: { operation: "validate", input: { amount: 0 } } });
  assert.equal(i.data.payload.validation.valid, false);
  assert.equal(i.data.payload.validation.issues[0].code, "MANDATORY_CONDITION_FAILED");
});

test("REQ-46504 / SRS-FR-2338: audit integrity and tenant isolation", async () => {
  const r = req("REQ-46504"); assert.equal(r.pattern, "XX04");
  const s = new AuditEvidenceService();
  const a = await s.execute(r, { context: ctx("46504-append"), payload: { operation: "append", evidence: { id: "46504-evidence", tenantId: "wave-03-ch465", requirementId: "REQ-46504", action: "MATERIAL_EVENT", principalId: "wave-03-runner", correlationId: "46504-append", occurredAt: "2026-09-24T04:00:00.000Z", payload: { result: "PASS" } } } });
  assert.match(a.data.payload.evidence.integrityHash, /^[a-f0-9]{64}$/);
  const own = await s.execute(r, { context: ctx("46504-list"), payload: { operation: "listByRequirement", tenantId: "wave-03-ch465", requirementId: "REQ-46504" } });
  assert.equal(own.data.payload.evidence.length, 1);
  const other = await s.execute(r, { context: { ...ctx("46504-other"), tenantId: "other-tenant" }, payload: { operation: "listByRequirement", tenantId: "other-tenant", requirementId: "REQ-46504" } });
  assert.equal(other.data.payload.evidence.length, 0);
});

test("REQ-46505 / SRS-FR-2339: controlled exception lifecycle", async () => {
  const r = req("REQ-46505"); assert.equal(r.pattern, "XX05");
  const s = new ExceptionHandlingService();
  await s.execute(r, { context: ctx("46505-create"), payload: { operation: "create", exception: { id: "46505-exception", tenantId: "wave-03-ch465", requirementId: "REQ-46505", code: "CONTROLLED_FAILURE", message: "Acceptance scenario", idempotencyKey: "46505-idempotency", createdAt: "2026-09-24T04:00:00.000Z" } } });
  const retry = await s.execute(r, { context: ctx("46505-retry"), payload: { operation: "transition", tenantId: "wave-03-ch465", id: "46505-exception", patch: { state: "RETRYING" } } });
  assert.equal(retry.data.payload.exception.state, "RETRYING");
  const resolved = await s.execute(r, { context: ctx("46505-resolve"), payload: { operation: "transition", tenantId: "wave-03-ch465", id: "46505-exception", patch: { state: "RESOLVED" } } });
  assert.equal(resolved.data.payload.exception.state, "RESOLVED");
  assert.throws(() => s.execute(r, { context: ctx("46505-invalid"), payload: { operation: "transition", tenantId: "wave-03-ch465", id: "46505-exception", patch: { state: "RETRYING" } } }), /EXCEPTION_INVALID_TRANSITION/);
});

test("REQ-46506 / SRS-FR-2340: governed reporting and tenant isolation", async () => {
  const r = req("REQ-46506"); assert.equal(r.pattern, "XX06");
  const s = new GovernedReportingService();
  await s.execute(r, { context: ctx("46506-publish"), payload: { operation: "publish", row: { tenantId: "wave-03-ch465", reportId: "status-performance", values: { state: "OPEN", performance: 99 }, sourceRequirementIds: ["REQ-46506"], generatedAt: "2026-09-24T04:00:00.000Z" } } });
  const own = await s.execute(r, { context: ctx("46506-query"), payload: { operation: "query", request: { tenantId: "wave-03-ch465", reportId: "status-performance", filters: { state: "OPEN" }, limit: 10 } } });
  assert.equal(own.data.payload.rows.length, 1);
  const other = await s.execute(r, { context: { ...ctx("46506-other"), tenantId: "other-tenant" }, payload: { operation: "query", request: { tenantId: "other-tenant", reportId: "status-performance", limit: 10 } } });
  assert.equal(other.data.payload.rows.length, 0);
});
