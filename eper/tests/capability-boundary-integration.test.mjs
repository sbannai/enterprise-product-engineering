import assert from "node:assert/strict";
import test from "node:test";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import {
  AuthoritativeRecordService,
  AuthorizationService,
  BusinessValidationService,
  AuditEvidenceService,
  ExceptionHandlingService,
  GovernedReportingService,
} from "../dist/packages/capabilities/index.js";

const req = (pattern) => requirementBindings.find((r) => r.pattern === pattern);

test("XX01 service executes authoritative record create/update through its boundary", async () => {
  const service = new AuthoritativeRecordService();
  const requirement = req("XX01");
  const context = { tenantId: "tenant-a", principalId: "user-a", correlationId: "c1" };
  const created = await service.execute(requirement, { context, payload: { operation: "create", record: { id: "r1", version: 1, state: "OPEN", data: { amount: 10 } } } });
  assert.equal(created.data.payload.operation, "create");
  assert.equal(created.data.payload.record.version, 1);
  const updated = await service.execute(requirement, { context, payload: { operation: "update", id: "r1", expectedVersion: 1, patch: { state: "CLOSED" } } });
  assert.equal(updated.data.payload.record.version, 2);
});

test("XX02 service executes policy decision through its boundary", async () => {
  const service = new AuthorizationService();
  const requirement = req("XX02");
  const result = await service.execute(requirement, {
    payload: {
      operation: "decide",
      policies: [{ tenantId: "tenant-a", actions: ["read"], resources: ["student"], effect: "ALLOW" }],
      request: { tenantId: "tenant-a", principalId: "user-a", action: "read", resource: "student" },
    },
  });
  assert.equal(result.data.payload.decision.effect, "ALLOW");
});

test("XX03 service executes registered business rules", async () => {
  const service = new BusinessValidationService();
  service.addRule({ id: "required-name", evaluate: (input) => input && input.name ? null : { code: "NAME_REQUIRED", message: "Name is required", severity: "ERROR" } });
  const result = await service.execute(req("XX03"), { payload: { operation: "validate", input: { name: "" } } });
  assert.equal(result.data.payload.validation.valid, false);
  assert.equal(result.data.payload.validation.issues[0].code, "NAME_REQUIRED");
});

test("XX04 service appends and retrieves audit evidence", async () => {
  const service = new AuditEvidenceService();
  const evidence = { id: "a1", tenantId: "tenant-a", requirementId: req("XX04").id, action: "CREATE", principalId: "user-a", correlationId: "c1", occurredAt: "2026-09-23T15:00:00Z", payload: { x: 1 } };
  const result = await service.execute(req("XX04"), { payload: { operation: "append", evidence } });
  assert.equal(result.data.payload.evidence.integrityHash.length, 64);
  const found = await service.execute(req("XX04"), { payload: { operation: "get", tenantId: "tenant-a", id: "a1" } });
  assert.equal(found.data.payload.evidence.id, "a1");
});

test("XX05 service executes exception lifecycle", async () => {
  const service = new ExceptionHandlingService();
  const requirement = req("XX05");
  await service.execute(requirement, { payload: { operation: "create", exception: { id: "e1", tenantId: "tenant-a", requirementId: requirement.id, code: "E1", message: "failed", idempotencyKey: "idem-1", createdAt: "2026-09-23T15:00:00Z" } } });
  const result = await service.execute(requirement, { payload: { operation: "transition", tenantId: "tenant-a", id: "e1", patch: { state: "RETRYING" } } });
  assert.equal(result.data.payload.exception.state, "RETRYING");
  assert.equal(result.data.payload.exception.retryCount, 1);
});

test("XX06 service publishes and queries governed reporting data", async () => {
  const service = new GovernedReportingService();
  const requirement = req("XX06");
  await service.execute(requirement, { payload: { operation: "publish", row: { tenantId: "tenant-a", reportId: "rpt-1", values: { status: "OPEN" }, sourceRequirementIds: [requirement.id], generatedAt: "2026-09-23T15:00:00Z" } } });
  const result = await service.execute(requirement, { payload: { operation: "query", request: { tenantId: "tenant-a", reportId: "rpt-1", filters: { status: "OPEN" } } } });
  assert.equal(result.data.payload.rows.length, 1);
});
