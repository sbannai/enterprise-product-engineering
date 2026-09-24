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
  const requirement = requirementBindings.find((r) => r.id === id);
  assert.ok(requirement, `Missing governed requirement: ${id}`);
  return requirement;
};

const context = (correlationId) => ({
  tenantId: "wave-02-ch464",
  principalId: "wave-02-runner",
  correlationId,
});

test("REQ-46401 / SRS-FR-2329: authoritative lifecycle and version-controlled update", async () => {
  const requirement = req("REQ-46401");
  assert.equal(requirement.pattern, "XX01");
  const service = new AuthoritativeRecordService();
  await service.execute(requirement, { context: context("46401-create"), payload: { operation: "create", record: { id: "46401-record", tenantId: "wave-02-ch464", version: 1, state: "OPEN", data: { source: "acceptance-wave-02" } } } });
  const updated = await service.execute(requirement, { context: context("46401-update"), payload: { operation: "update", tenantId: "wave-02-ch464", id: "46401-record", expectedVersion: 1, patch: { state: "CLOSED" } } });
  assert.equal(updated.data.payload.record.version, 2);
  assert.equal(updated.data.payload.record.state, "CLOSED");
  assert.throws(() => service.execute(requirement, { context: context("46401-stale"), payload: { operation: "update", tenantId: "wave-02-ch464", id: "46401-record", expectedVersion: 1, patch: { state: "REOPENED" } } }), /RECORD_VERSION_CONFLICT/);
});

test("REQ-46402 / SRS-FR-2330: authorization enforces deny precedence and default deny", async () => {
  const requirement = req("REQ-46402");
  assert.equal(requirement.pattern, "XX02");
  const service = new AuthorizationService();
  const decision = await service.execute(requirement, { context: context("46402-deny"), payload: { operation: "decide", request: { tenantId: "wave-02-ch464", principalId: "actor-46402", action: "material.update", resource: "authoritative-record" }, policies: [{ tenantId: "wave-02-ch464", principalId: "actor-46402", actions: ["material.update"], resources: ["authoritative-record"], effect: "ALLOW" }, { tenantId: "wave-02-ch464", principalId: "actor-46402", actions: ["material.update"], resources: ["authoritative-record"], effect: "DENY" }] } });
  assert.equal(decision.data.payload.decision.effect, "DENY");
  const defaultDeny = await service.execute(requirement, { context: context("46402-default"), payload: { operation: "decide", request: { tenantId: "wave-02-ch464", principalId: "unlisted-actor", action: "material.delete", resource: "authoritative-record" } } });
  assert.equal(defaultDeny.data.payload.decision.effect, "DENY");
});

test("REQ-46403 / SRS-FR-2331: business validation rejects a mandatory invalid condition", async () => {
  const requirement = req("REQ-46403");
  assert.equal(requirement.pattern, "XX03");
  const service = new BusinessValidationService();
  service.addRule({ id: "46403-positive-amount", evaluate: (input) => input?.amount > 0 ? null : { code: "MANDATORY_CONDITION_FAILED", message: "Amount must be positive", severity: "ERROR" } });
  const valid = await service.execute(requirement, { context: context("46403-valid"), payload: { operation: "validate", input: { amount: 100 } } });
  assert.equal(valid.data.payload.validation.valid, true);
  const invalid = await service.execute(requirement, { context: context("46403-invalid"), payload: { operation: "validate", input: { amount: 0 } } });
  assert.equal(invalid.data.payload.validation.valid, false);
  assert.equal(invalid.data.payload.validation.issues[0].code, "MANDATORY_CONDITION_FAILED");
});

test("REQ-46404 / SRS-FR-2332: audit evidence preserves integrity and tenant boundary", async () => {
  const requirement = req("REQ-46404");
  assert.equal(requirement.pattern, "XX04");
  const service = new AuditEvidenceService();
  const appended = await service.execute(requirement, { context: context("46404-append"), payload: { operation: "append", evidence: { id: "46404-evidence", tenantId: "wave-02-ch464", requirementId: "REQ-46404", action: "MATERIAL_EVENT", principalId: "wave-02-runner", correlationId: "46404-append", occurredAt: "2026-09-24T03:00:00.000Z", payload: { result: "PASS" } } } });
  assert.match(appended.data.payload.evidence.integrityHash, /^[a-f0-9]{64}$/);
  const own = await service.execute(requirement, { context: context("46404-list"), payload: { operation: "listByRequirement", tenantId: "wave-02-ch464", requirementId: "REQ-46404" } });
  assert.equal(own.data.payload.evidence.length, 1);
  const other = await service.execute(requirement, { context: { ...context("46404-other"), tenantId: "other-tenant" }, payload: { operation: "listByRequirement", tenantId: "other-tenant", requirementId: "REQ-46404" } });
  assert.equal(other.data.payload.evidence.length, 0);
});

test("REQ-46405 / SRS-FR-2333: exception lifecycle permits retry/resolution and rejects invalid terminal transition", async () => {
  const requirement = req("REQ-46405");
  assert.equal(requirement.pattern, "XX05");
  const service = new ExceptionHandlingService();
  await service.execute(requirement, { context: context("46405-create"), payload: { operation: "create", exception: { id: "46405-exception", tenantId: "wave-02-ch464", requirementId: "REQ-46405", code: "CONTROLLED_FAILURE", message: "Acceptance scenario", idempotencyKey: "46405-idempotency", createdAt: "2026-09-24T03:00:00.000Z" } } });
  const retrying = await service.execute(requirement, { context: context("46405-retry"), payload: { operation: "transition", tenantId: "wave-02-ch464", id: "46405-exception", patch: { state: "RETRYING" } } });
  assert.equal(retrying.data.payload.exception.state, "RETRYING");
  const resolved = await service.execute(requirement, { context: context("46405-resolve"), payload: { operation: "transition", tenantId: "wave-02-ch464", id: "46405-exception", patch: { state: "RESOLVED" } } });
  assert.equal(resolved.data.payload.exception.state, "RESOLVED");
  assert.throws(() => service.execute(requirement, { context: context("46405-invalid"), payload: { operation: "transition", tenantId: "wave-02-ch464", id: "46405-exception", patch: { state: "RETRYING" } } }), /EXCEPTION_INVALID_TRANSITION/);
});

test("REQ-46406 / SRS-FR-2334: governed reporting publishes, queries and isolates tenant data", async () => {
  const requirement = req("REQ-46406");
  assert.equal(requirement.pattern, "XX06");
  const service = new GovernedReportingService();
  await service.execute(requirement, { context: context("46406-publish"), payload: { operation: "publish", row: { tenantId: "wave-02-ch464", reportId: "status-performance", values: { state: "OPEN", performance: 99 }, sourceRequirementIds: ["REQ-46406"], generatedAt: "2026-09-24T03:00:00.000Z" } } });
  const own = await service.execute(requirement, { context: context("46406-query"), payload: { operation: "query", request: { tenantId: "wave-02-ch464", reportId: "status-performance", filters: { state: "OPEN" }, limit: 10 } } });
  assert.equal(own.data.payload.rows.length, 1);
  const other = await service.execute(requirement, { context: { ...context("46406-other"), tenantId: "other-tenant" }, payload: { operation: "query", request: { tenantId: "other-tenant", reportId: "status-performance", limit: 10 } } });
  assert.equal(other.data.payload.rows.length, 0);
});
