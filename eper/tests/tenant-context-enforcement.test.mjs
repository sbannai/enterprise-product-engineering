import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import {
  AuthoritativeRecordService,
  AuthorizationService,
  AuditEvidenceService,
  ExceptionHandlingService,
  GovernedReportingService,
} from "../dist/packages/capabilities/services.js";

const req = (pattern) => requirementBindings.find((r) => r.pattern === pattern);
const context = (tenantId = "tenant-a") => ({ tenantId, principalId: "tester", correlationId: "tenant-boundary-test" });

test("authoritative record operations reject tenant spoofing and missing caller context", async () => {
  const service = new AuthoritativeRecordService();
  const requirement = req("XX01");
  assert.throws(() => service.execute(requirement, {
    context: context("tenant-a"),
    payload: { operation: "create", record: { id: "r1", tenantId: "tenant-b", version: 1, state: "OPEN", data: {} } },
  }), /TENANT_CONTEXT_MISMATCH/);
  assert.throws(() => service.execute(requirement, {
    payload: { operation: "get", tenantId: "tenant-a", id: "r1" },
  }), /CAPABILITY_CONTEXT_REQUIRED/);
});

test("authorization request tenant must match authenticated context", () => {
  const service = new AuthorizationService();
  assert.throws(() => service.execute(req("XX02"), {
    context: context("tenant-a"),
    payload: { operation: "decide", request: { tenantId: "tenant-b", principalId: "tester", action: "read", resource: "record" } },
  }), /TENANT_CONTEXT_MISMATCH/);
});

test("audit evidence append and query tenant must match authenticated context", () => {
  const service = new AuditEvidenceService();
  assert.throws(() => service.execute(req("XX04"), {
    context: context("tenant-a"),
    payload: { operation: "append", evidence: { id: "e1", tenantId: "tenant-b", requirementId: "REQ-46304", action: "TEST", principalId: "tester", correlationId: "c1", occurredAt: "2026-10-03T00:00:00.000Z", payload: {} } },
  }), /TENANT_CONTEXT_MISMATCH/);
  assert.throws(() => service.execute(req("XX04"), {
    context: context("tenant-a"),
    payload: { operation: "listByRequirement", tenantId: "tenant-b", requirementId: "REQ-46304" },
  }), /TENANT_CONTEXT_MISMATCH/);
});

test("exception and reporting operations reject cross-tenant payloads", () => {
  const exceptions = new ExceptionHandlingService();
  assert.throws(() => exceptions.execute(req("XX05"), {
    context: context("tenant-a"),
    payload: { operation: "create", exception: { id: "x1", tenantId: "tenant-b", requirementId: "REQ-46305", code: "X", message: "x", idempotencyKey: "i1", createdAt: "2026-10-03T00:00:00.000Z" } },
  }), /TENANT_CONTEXT_MISMATCH/);
  const reporting = new GovernedReportingService();
  assert.throws(() => reporting.execute(req("XX06"), {
    context: context("tenant-a"),
    payload: { operation: "query", request: { tenantId: "tenant-b", reportId: "r1" } },
  }), /TENANT_CONTEXT_MISMATCH/);
});
