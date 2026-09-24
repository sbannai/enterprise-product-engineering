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
  tenantId: "wave-01-ch463",
  principalId: "wave-01-runner",
  correlationId,
});

test("REQ-46301 / SRS-FR-2323: authoritative record valid lifecycle and invalid version handling", async () => {
  const requirement = req("REQ-46301");
  assert.equal(requirement.pattern, "XX01");
  const service = new AuthoritativeRecordService();

  const created = await service.execute(requirement, {
    context: context("req-46301-create"),
    payload: {
      operation: "create",
      record: {
        id: "req-46301-record",
        tenantId: "wave-01-ch463",
        version: 1,
        state: "OPEN",
        data: { source: "acceptance-wave-01" },
      },
    },
  });
  assert.equal(created.requirementId, "REQ-46301");
  assert.equal(created.data.payload.record.state, "OPEN");

  const updated = await service.execute(requirement, {
    context: context("req-46301-update"),
    payload: {
      operation: "update",
      tenantId: "wave-01-ch463",
      id: "req-46301-record",
      expectedVersion: 1,
      patch: { state: "CLOSED" },
    },
  });
  assert.equal(updated.data.payload.record.version, 2);
  assert.equal(updated.data.payload.record.state, "CLOSED");

  assert.throws(
    () => service.execute(requirement, {
      context: context("req-46301-invalid"),
      payload: {
        operation: "update",
        tenantId: "wave-01-ch463",
        id: "req-46301-record",
        expectedVersion: 1,
        patch: { state: "REOPENED" },
      },
    }),
    /RECORD_VERSION_CONFLICT/,
  );
});

test("REQ-46302 / SRS-FR-2324: role authorization enforces allow, deny precedence and default deny", async () => {
  const requirement = req("REQ-46302");
  assert.equal(requirement.pattern, "XX02");
  const service = new AuthorizationService();

  const decision = await service.execute(requirement, {
    context: context("req-46302-deny-precedence"),
    payload: {
      operation: "decide",
      request: {
        tenantId: "wave-01-ch463",
        principalId: "actor-46302",
        action: "material.update",
        resource: "authoritative-record",
      },
      policies: [
        { tenantId: "wave-01-ch463", principalId: "actor-46302", actions: ["material.update"], resources: ["authoritative-record"], effect: "ALLOW" },
        { tenantId: "wave-01-ch463", principalId: "actor-46302", actions: ["material.update"], resources: ["authoritative-record"], effect: "DENY" },
      ],
    },
  });
  assert.equal(decision.data.payload.decision.effect, "DENY");

  const defaultDeny = await service.execute(requirement, {
    context: context("req-46302-default-deny"),
    payload: {
      operation: "decide",
      request: {
        tenantId: "wave-01-ch463",
        principalId: "unlisted-actor",
        action: "material.delete",
        resource: "authoritative-record",
      },
    },
  });
  assert.equal(defaultDeny.data.payload.decision.effect, "DENY");
});

test("REQ-46303 / SRS-FR-2325: mandatory business condition passes when valid and rejects invalid input", async () => {
  const requirement = req("REQ-46303");
  assert.equal(requirement.pattern, "XX03");
  const service = new BusinessValidationService();

  service.addRule({
    id: "req-46303-positive-amount",
    evaluate: (input) =>
      input?.amount > 0
        ? null
        : { code: "MANDATORY_CONDITION_FAILED", message: "Amount must be positive", severity: "ERROR" },
  });

  const valid = await service.execute(requirement, {
    context: context("req-46303-valid"),
    payload: { operation: "validate", input: { amount: 100 } },
  });
  assert.equal(valid.data.payload.validation.valid, true);

  const invalid = await service.execute(requirement, {
    context: context("req-46303-invalid"),
    payload: { operation: "validate", input: { amount: 0 } },
  });
  assert.equal(invalid.data.payload.validation.valid, false);
  assert.equal(invalid.data.payload.validation.issues[0].code, "MANDATORY_CONDITION_FAILED");
});

test("REQ-46304 / SRS-FR-2326: audit evidence preserves integrity and tenant boundary", async () => {
  const requirement = req("REQ-46304");
  assert.equal(requirement.pattern, "XX04");
  const service = new AuditEvidenceService();

  const appended = await service.execute(requirement, {
    context: context("req-46304-append"),
    payload: {
      operation: "append",
      evidence: {
        id: "req-46304-evidence",
        tenantId: "wave-01-ch463",
        requirementId: "REQ-46304",
        action: "MATERIAL_EVENT",
        principalId: "wave-01-runner",
        correlationId: "req-46304-append",
        occurredAt: "2026-09-24T03:00:00.000Z",
        payload: { result: "PASS" },
      },
    },
  });
  assert.equal(appended.requirementId, "REQ-46304");
  assert.match(appended.data.payload.evidence.integrityHash, /^[a-f0-9]{64}$/);

  const own = await service.execute(requirement, {
    context: context("req-46304-list"),
    payload: {
      operation: "listByRequirement",
      tenantId: "wave-01-ch463",
      requirementId: "REQ-46304",
    },
  });
  assert.equal(own.data.payload.evidence.length, 1);

  const other = await service.execute(requirement, {
    context: { ...context("req-46304-other"), tenantId: "other-tenant" },
    payload: {
      operation: "listByRequirement",
      tenantId: "other-tenant",
      requirementId: "REQ-46304",
    },
  });
  assert.equal(other.data.payload.evidence.length, 0);
});

test("REQ-46305 / SRS-FR-2327: controlled exception lifecycle permits retry/resolution and rejects invalid terminal transition", async () => {
  const requirement = req("REQ-46305");
  assert.equal(requirement.pattern, "XX05");
  const service = new ExceptionHandlingService();

  const created = await service.execute(requirement, {
    context: context("req-46305-create"),
    payload: {
      operation: "create",
      exception: {
        id: "req-46305-exception",
        tenantId: "wave-01-ch463",
        requirementId: "REQ-46305",
        code: "CONTROLLED_FAILURE",
        message: "Acceptance test failure scenario",
        idempotencyKey: "req-46305-idempotency",
        createdAt: "2026-09-24T03:00:00.000Z",
      },
    },
  });
  assert.equal(created.data.payload.exception.state, "OPEN");

  const retrying = await service.execute(requirement, {
    context: context("req-46305-retry"),
    payload: {
      operation: "transition",
      tenantId: "wave-01-ch463",
      id: "req-46305-exception",
      patch: { state: "RETRYING" },
    },
  });
  assert.equal(retrying.data.payload.exception.state, "RETRYING");

  const resolved = await service.execute(requirement, {
    context: context("req-46305-resolve"),
    payload: {
      operation: "transition",
      tenantId: "wave-01-ch463",
      id: "req-46305-exception",
      patch: { state: "RESOLVED" },
    },
  });
  assert.equal(resolved.data.payload.exception.state, "RESOLVED");

  assert.throws(
    () => service.execute(requirement, {
      context: context("req-46305-invalid"),
      payload: {
        operation: "transition",
        tenantId: "wave-01-ch463",
        id: "req-46305-exception",
        patch: { state: "RETRYING" },
      },
    }),
    /EXCEPTION_INVALID_TRANSITION/,
  );
});

test("REQ-46306 / SRS-FR-2328: governed reporting publishes, queries and isolates tenant data", async () => {
  const requirement = req("REQ-46306");
  assert.equal(requirement.pattern, "XX06");
  const service = new GovernedReportingService();

  await service.execute(requirement, {
    context: context("req-46306-publish"),
    payload: {
      operation: "publish",
      row: {
        tenantId: "wave-01-ch463",
        reportId: "status-performance",
        values: { state: "OPEN", performance: 99 },
        sourceRequirementIds: ["REQ-46306"],
        generatedAt: "2026-09-24T03:00:00.000Z",
      },
    },
  });

  const own = await service.execute(requirement, {
    context: context("req-46306-query"),
    payload: {
      operation: "query",
      request: {
        tenantId: "wave-01-ch463",
        reportId: "status-performance",
        filters: { state: "OPEN" },
        limit: 10,
      },
    },
  });
  assert.equal(own.data.payload.rows.length, 1);

  const other = await service.execute(requirement, {
    context: { ...context("req-46306-other"), tenantId: "other-tenant" },
    payload: {
      operation: "query",
      request: { tenantId: "other-tenant", reportId: "status-performance", limit: 10 },
    },
  });
  assert.equal(other.data.payload.rows.length, 0);
});
