import test from "node:test";
import assert from "node:assert/strict";
import {
  TICKET_STATUSES,
  TICKET_SEVERITIES,
  TICKET_TYPES,
  validateCreateTicketInput,
} from "../dist/packages/ticketing/ticketing-contract.js";

test("ticketing domain exports controlled lifecycle values", () => {
  assert.deepEqual(TICKET_TYPES, ["defect", "feedback", "feature_request", "question"]);
  assert.deepEqual(TICKET_SEVERITIES, ["p1_candidate", "p1_confirmed", "p2", "p3", "p4"]);
  assert.deepEqual(TICKET_STATUSES, ["new", "triaged", "assigned", "in_progress", "resolved", "closed"]);
});

test("ticket creation accepts valid customer fields and trims text", () => {
  const result = validateCreateTicketInput({
    type: "defect",
    title: "  Receipt download  ",
    description: "  Download action is missing.  ",
    businessImpact: "  Customer cannot retrieve proof of payment. ",
    evidenceReference: "  evidence://case-123  ",
  });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.value.title, "Receipt download");
    assert.equal(result.value.description, "Download action is missing.");
    assert.equal(result.value.evidenceReference, "evidence://case-123");
  }
});

test("ticket creation rejects invalid type, empty required fields and oversized content", () => {
  const result = validateCreateTicketInput({
    type: "urgent",
    title: " ",
    description: "x".repeat(8001),
    businessImpact: "",
  });
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.errors.includes("invalid_type"));
    assert.ok(result.errors.includes("title_required_or_too_long"));
    assert.ok(result.errors.includes("description_required_or_too_long"));
    assert.ok(result.errors.includes("business_impact_required_or_too_long"));
  }
});

test("ticket creation rejects client attempts to choose tenant, actor, severity, status or assignment", () => {
  const result = validateCreateTicketInput({
    type: "feedback",
    title: "UI issue",
    description: "Description",
    businessImpact: "Impact",
    tenantId: "other-tenant",
    actorId: "admin",
    severity: "p1_candidate",
    status: "closed",
    assignedTo: "attacker",
  });
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.errors.some((error) => error === "server_managed_field_forbidden:tenantId"));
    assert.ok(result.errors.some((error) => error === "server_managed_field_forbidden:severity"));
    assert.ok(result.errors.some((error) => error === "server_managed_field_forbidden:status"));
  }
});

test("ticket creation rejects unknown body shapes and invalid evidence reference", () => {
  assert.equal(validateCreateTicketInput([]).valid, false);
  const result = validateCreateTicketInput({
    type: "question", title: "Question", description: "Details",
    businessImpact: "Impact", evidenceReference: "x".repeat(501),
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.ok(result.errors.includes("invalid_evidence_reference"));
});
