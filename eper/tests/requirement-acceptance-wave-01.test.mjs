import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { InMemoryAuditEvidenceStore } from "../dist/packages/capabilities/audit-evidence.js";
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
  principalId: "actor-46302",
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

  assert.throws(
    () => service.execute(requirement, {
      context: context("req-46301-duplicate"),
      payload: {
        operation: "create",
        record: {
          id: "req-46301-record",
          tenantId: "wave-01-ch463",
          version: 1,
          state: "OPEN",
          data: { source: "duplicate" },
        },
      },
    }),
    /RECORD_ALREADY_EXISTS/,
  );

  const crossTenantRead = await service.execute(requirement, {
    context: { ...context("req-46301-cross-tenant"), tenantId: "other-tenant" },
    payload: { operation: "get", tenantId: "other-tenant", id: "req-46301-record" },
  });
  assert.equal(crossTenantRead.data.payload.record, undefined);

  assert.throws(
    () => service.execute(requirement, {
      context: context("req-46301-missing"),
      payload: {
        operation: "update",
        tenantId: "wave-01-ch463",
        id: "missing-record",
        expectedVersion: 1,
        patch: { state: "CLOSED" },
      },
    }),
    /RECORD_NOT_FOUND/,
  );

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

  const allowPolicy = {
    tenantId: "wave-01-ch463",
    principalId: "actor-46302",
    actions: ["material.update"],
    resources: ["authoritative-record"],
    effect: "ALLOW",
  };
  const denyPolicy = {
    tenantId: "wave-01-ch463",
    principalId: "actor-46302",
    actions: ["material.update"],
    resources: ["authoritative-record"],
    effect: "DENY",
  };

  // Policies must be registered through the service API. A payload.policies field
  // is not consumed by AuthorizationService.execute and would make this test vacuous.
  const denyPrecedenceService = new AuthorizationService();
  denyPrecedenceService.addPolicy(allowPolicy);
  denyPrecedenceService.addPolicy(denyPolicy);
  const decision = await denyPrecedenceService.execute(requirement, {
    context: context("req-46302-deny-precedence"),
    payload: {
      operation: "decide",
      request: {
        tenantId: "wave-01-ch463",
        principalId: "actor-46302",
        action: "material.update",
        resource: "authoritative-record",
      },
    },
  });
  assert.equal(decision.data.payload.decision.effect, "DENY");
  assert.equal(decision.data.payload.decision.reason, "EXPLICIT_DENY_POLICY");

  const allowOnlyService = new AuthorizationService();
  allowOnlyService.addPolicy(allowPolicy);
  const allowed = await allowOnlyService.execute(requirement, {
    context: context("req-46302-allow"),
    payload: {
      operation: "decide",
      request: {
        tenantId: "wave-01-ch463",
        principalId: "actor-46302",
        action: "material.update",
        resource: "authoritative-record",
      },
    },
  });
  assert.equal(allowed.data.payload.decision.effect, "ALLOW");
  assert.equal(allowed.data.payload.decision.reason, "ALLOW_POLICY_MATCH");

  const defaultDenyService = new AuthorizationService();
  const defaultDeny = await defaultDenyService.execute(requirement, {
    context: context("req-46302-default-deny"),
    payload: {
      operation: "decide",
      request: {
        tenantId: "wave-01-ch463",
        principalId: "actor-46302",
        action: "material.delete",
        resource: "authoritative-record",
      },
    },
  });
  assert.equal(defaultDeny.data.payload.decision.effect, "DENY");
  assert.equal(defaultDeny.data.payload.decision.reason, "NO_ALLOW_POLICY");
});

test("REQ-46303 / SRS-FR-2325: mandatory business condition passes when valid and rejects invalid input", async () => {
  const requirement = req("REQ-46303");
  assert.equal(requirement.pattern, "XX03");
  const service = new BusinessValidationService();

  const positiveAmountRule = {
    id: "req-46303-positive-amount",
    evaluate: (input) =>
      input?.amount > 0
        ? null
        : { code: "MANDATORY_CONDITION_FAILED", message: "Amount must be positive", severity: "ERROR" },
  };
  service.addRule(positiveAmountRule);
  assert.throws(() => service.addRule(positiveAmountRule), /VALIDATION_RULE_DUPLICATE/);
  service.addRule({
    id: "req-46303-reference-required",
    evaluate: (input) =>
      typeof input?.reference === "string" && input.reference.length > 0
        ? null
        : { code: "REFERENCE_REQUIRED", message: "Reference is required", severity: "ERROR" },
  });

  const valid = await service.execute(requirement, {
    context: context("req-46303-valid"),
    payload: { operation: "validate", input: { amount: 100, reference: "REF-46303" } },
  });
  assert.equal(valid.data.payload.validation.valid, true);

  const invalid = await service.execute(requirement, {
    context: context("req-46303-invalid"),
    payload: { operation: "validate", input: { amount: 0 } },
  });
  assert.equal(invalid.data.payload.validation.valid, false);
  assert.deepEqual(
    invalid.data.payload.validation.issues.map((issue) => issue.code).sort(),
    ["MANDATORY_CONDITION_FAILED", "REFERENCE_REQUIRED"],
  );
});

test("REQ-46304 / SRS-FR-2326: audit evidence preserves integrity and tenant boundary", async () => {
  const requirement = req("REQ-46304");
  assert.equal(requirement.pattern, "XX04");
  const evidenceStore = new InMemoryAuditEvidenceStore();
  const service = new AuditEvidenceService(evidenceStore);

  const appended = await service.execute(requirement, {
    context: context("req-46304-append"),
    payload: {
      operation: "append",
      evidence: {
        id: "req-46304-evidence",
        tenantId: "wave-01-ch463",
        requirementId: "REQ-46304",
        action: "MATERIAL_EVENT",
        principalId: "actor-46302",
        correlationId: "req-46304-append",
        occurredAt: "2026-09-24T03:00:00.000Z",
        payload: { result: "PASS" },
      },
    },
  });
  assert.equal(appended.requirementId, "REQ-46304");
  assert.match(appended.data.payload.evidence.integrityHash, /^[a-f0-9]{64}$/);
  assert.equal(evidenceStore.verify(appended.data.payload.evidence), true);
  assert.equal(evidenceStore.verify({
    ...appended.data.payload.evidence,
    payload: { result: "TAMPERED" },
  }), false);

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
  const lifecycleEvidence = new InMemoryAuditEvidenceStore();
  const service = new ExceptionHandlingService(undefined, lifecycleEvidence);

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
};
  const created = await service.execute(requirement, createInput);
  assert.equal(created.data.payload.exception.state, "OPEN");
  const replayed = await service.execute(requirement, {
    ...createInput,
    context: context("req-46305-create-replay"),
  });
  assert.equal(replayed.data.payload.exception.id, "req-46305-exception");
  assert.equal(lifecycleEvidence.listByRequirement("wave-01-ch463", "REQ-46305").length, 1);
  assert.throws(
    () => service.execute(requirement, {
      context: context("req-46305-idempotency-conflict"),
      payload: {
        ...createInput.payload,
        exception: { ...createInput.payload.exception, message: "Different request, same key" },
      },
    }),
    /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST/,
  );

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

  const lifecycleEvents = lifecycleEvidence.listByRequirement("wave-01-ch463", "REQ-46305");
  assert.equal(lifecycleEvents.length, 3);
  assert.deepEqual(lifecycleEvents.map((event) => event.action), [
    "EXCEPTION_CREATED", "EXCEPTION_TRANSITIONED", "EXCEPTION_TRANSITIONED",
  ]);
  assert.ok(lifecycleEvents.every((event) => lifecycleEvidence.verify(event)));

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

  await service.execute(requirement, {
    context: { ...context("req-46306-publish-other"), tenantId: "other-tenant" },
    payload: {
      operation: "publish",
      row: {
        tenantId: "other-tenant",
        reportId: "status-performance",
        values: { state: "OPEN", performance: 11 },
        sourceRequirementIds: ["REQ-46306"],
        generatedAt: "2026-09-24T03:01:00.000Z",
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
  assert.equal(own.data.payload.rows[0].values.performance, 99);

  const other = await service.execute(requirement, {
    context: { ...context("req-46306-other"), tenantId: "other-tenant" },
    payload: {
      operation: "query",
      request: { tenantId: "other-tenant", reportId: "status-performance", limit: 10 },
    },
  });
  assert.equal(other.data.payload.rows.length, 1);
  assert.equal(other.data.payload.rows[0].values.performance, 11);
});
