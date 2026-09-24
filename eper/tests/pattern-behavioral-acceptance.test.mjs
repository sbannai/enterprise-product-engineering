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

const req = (pattern) => requirementBindings.find((r) => r.pattern === pattern);
const context = (id) => ({
  tenantId: "behavioral-acceptance",
  principalId: "acceptance-runner",
  correlationId: id,
});

test("XX01 authoritative records: create, update, version control and tenant isolation", async () => {
  const service = new AuthoritativeRecordService();
  const requirement = req("XX01");
  const created = await service.execute(requirement, {
    context: context("xx01-create"),
    payload: { operation: "create", record: { id: "rec-1", data: { state: "OPEN" } } },
  });
  assert.equal(created.data.payload.operation, "create");
  assert.equal(created.data.payload.record.version, 1);

  const updated = await service.execute(requirement, {
    context: context("xx01-update"),
    payload: {
      operation: "update",
      id: "rec-1",
      expectedVersion: 1,
      patch: { data: { state: "CLOSED" } },
    },
  });
  assert.equal(updated.data.payload.record.version, 2);
  assert.equal(updated.data.payload.record.data.state, "CLOSED");

  await assert.rejects(
    service.execute(requirement, {
      context: context("xx01-stale"),
      payload: { operation: "update", id: "rec-1", expectedVersion: 1, patch: {} },
    }),
    /VERSION_CONFLICT/,
  );

  await assert.rejects(
    service.execute(requirement, {
      context: { ...context("xx01-tenant"), tenantId: "other-tenant" },
      payload: { operation: "get", id: "rec-1" },
    }),
    /RECORD_NOT_FOUND/,
  );
});

test("XX02 authorization: explicit allow, explicit deny precedence and default deny", async () => {
  const service = new AuthorizationService();
  const requirement = req("XX02");

  const result = await service.execute(requirement, {
    context: context("xx02"),
    payload: {
      operation: "decide",
      request: { tenantId: "behavioral-acceptance", principalId: "user-1", action: "read", resource: "record" },
      policies: [
        { id: "allow-read", effect: "ALLOW", principalId: "user-1", action: "read", resource: "record" },
        { id: "deny-read", effect: "DENY", principalId: "user-1", action: "read", resource: "record" },
      ],
    },
  });
  assert.equal(result.data.payload.decision.allowed, false);

  const allowed = await service.execute(requirement, {
    context: context("xx02-allow"),
    payload: {
      operation: "decide",
      request: { tenantId: "behavioral-acceptance", principalId: "user-2", action: "read", resource: "record" },
      policies: [{ id: "allow-user-2", effect: "ALLOW", principalId: "user-2", action: "read", resource: "record" }],
    },
  });
  assert.equal(allowed.data.payload.decision.allowed, true);

  const denied = await service.execute(requirement, {
    context: context("xx02-deny"),
    payload: {
      operation: "decide",
      request: { tenantId: "behavioral-acceptance", principalId: "unknown", action: "delete", resource: "record" },
    },
  });
  assert.equal(denied.data.payload.decision.allowed, false);
});

test("XX03 business validation: valid input passes and rule violation is reported", async () => {
  const service = new BusinessValidationService();
  const requirement = req("XX03");
  service.addRule({
    id: "amount-positive",
    description: "Amount must be positive",
    severity: "ERROR",
    validate: (input) => typeof input === "object" && input !== null && input.amount > 0,
  });

  const valid = await service.execute(requirement, {
    context: context("xx03-valid"),
    payload: { operation: "validate", input: { amount: 100 } },
  });
  assert.equal(valid.data.payload.validation.valid, true);

  const invalid = await service.execute(requirement, {
    context: context("xx03-invalid"),
    payload: { operation: "validate", input: { amount: 0 } },
  });
  assert.equal(invalid.data.payload.validation.valid, false);
  assert.equal(invalid.data.payload.validation.errors.length, 1);
});

test("XX04 audit evidence: append, integrity hash and tenant isolation", async () => {
  const service = new AuditEvidenceService();
  const requirement = req("XX04");
  const evidence = {
    id: "ev-1",
    tenantId: "behavioral-acceptance",
    requirementId: requirement.id,
    type: "TEST_EXECUTION",
    payload: { result: "PASS" },
  };

  const appended = await service.execute(requirement, {
    context: context("xx04-append"),
    payload: { operation: "append", evidence },
  });
  assert.equal(appended.data.payload.evidence.id, "ev-1");
  assert.match(appended.data.payload.evidence.integrityHash, /^[a-f0-9]{64}$/);

  const listed = await service.execute(requirement, {
    context: context("xx04-list"),
    payload: { operation: "listByRequirement", tenantId: "behavioral-acceptance", requirementId: requirement.id },
  });
  assert.equal(listed.data.payload.evidence.length, 1);

  const otherTenant = await service.execute(requirement, {
    context: context("xx04-other"),
    payload: { operation: "listByRequirement", tenantId: "other-tenant", requirementId: requirement.id },
  });
  assert.equal(otherTenant.data.payload.evidence.length, 0);
});

test("XX05 exception handling: valid transition, retry count and invalid terminal transition", async () => {
  const service = new ExceptionHandlingService();
  const requirement = req("XX05");

  const created = await service.execute(requirement, {
    context: context("xx05-create"),
    payload: {
      operation: "create",
      exception: { id: "ex-1", tenantId: "behavioral-acceptance", state: "OPEN", message: "failure" },
    },
  });
  assert.equal(created.data.payload.exception.state, "OPEN");

  const resolved = await service.execute(requirement, {
    context: context("xx05-resolve"),
    payload: {
      operation: "transition",
      tenantId: "behavioral-acceptance",
      id: "ex-1",
      patch: { state: "RESOLVED" },
    },
  });
  assert.equal(resolved.data.payload.exception.state, "RESOLVED");

  await assert.rejects(
    service.execute(requirement, {
      context: context("xx05-invalid"),
      payload: {
        operation: "transition",
        tenantId: "behavioral-acceptance",
        id: "ex-1",
        patch: { state: "RETRYING" },
      },
    }),
    /INVALID_EXCEPTION_TRANSITION/,
  );
});

test("XX06 governed reporting: publish, query filtering and tenant isolation", async () => {
  const service = new GovernedReportingService();
  const requirement = req("XX06");

  await service.execute(requirement, {
    context: context("xx06-publish"),
    payload: {
      operation: "publish",
      row: { id: "row-1", tenantId: "behavioral-acceptance", reportType: "STATUS", values: { state: "OPEN" } },
    },
  });

  const own = await service.execute(requirement, {
    context: context("xx06-query"),
    payload: {
      operation: "query",
      request: { tenantId: "behavioral-acceptance", reportType: "STATUS", limit: 10 },
    },
  });
  assert.equal(own.data.payload.rows.length, 1);

  const other = await service.execute(requirement, {
    context: context("xx06-other"),
    payload: {
      operation: "query",
      request: { tenantId: "other-tenant", reportType: "STATUS", limit: 10 },
    },
  });
  assert.equal(other.data.payload.rows.length, 0);
});
