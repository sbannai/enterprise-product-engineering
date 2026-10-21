import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = JSON.parse(
  await readFile(new URL("../contracts/CH463_IMPLEMENTATION_SHAPES_DRAFT.schema.json", import.meta.url), "utf8"),
);

test("Chapter 463 schema draft is valid JSON Schema-shaped metadata", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema["x-contract-status"], "DRAFT_TECHNICAL_NOT_APPROVED");
  assert.equal(schema.title, "Chapter 463 implementation-derived contract shapes (DRAFT)");
  assert.ok(schema.$defs && typeof schema.$defs === "object");
});

test("schema draft includes the six required capability implementation shapes", () => {
  for (const name of [
    "tenantContext",
    "capabilityInput",
    "capabilityResult",
    "contractDescriptor",
    "authoritativeRecord",
    "authorizationRequest",
    "validationIssue",
    "auditEvidence",
    "workflowException",
    "reportRow",
  ]) {
    assert.ok(schema.$defs[name], `Missing schema definition: ${name}`);
  }
});

test("requirement-specific shapes remain explicitly unapproved", () => {
  const expected = {
    authoritativeRecord: "REQ-46301",
    authorizationRequest: "REQ-46302",
    validationIssue: "REQ-46303",
    auditEvidence: "REQ-46304",
    workflowException: "REQ-46305",
    reportRow: "REQ-46306",
  };
  for (const [name, requirementId] of Object.entries(expected)) {
    assert.equal(schema.$defs[name]["x-requirement"], requirementId);
    assert.equal(schema.$defs[name]["x-approval-status"], "NOT_APPROVED");
  }
});

test("capability result cannot be mistaken for business acceptance", () => {
  const result = schema.$defs.capabilityResult;
  assert.equal(result.properties.status.const, "EXECUTED");
  assert.match(result.description, /not equivalent to business success or acceptance/i);
});

test("contract descriptors are identified as registry descriptors, not full contracts", () => {
  const descriptor = schema.$defs.contractDescriptor;
  assert.deepEqual(descriptor.required, ["id", "kind", "capability", "version"]);
  assert.match(descriptor.description, /not the DATA schema, API operation, or EVENT payload definition/i);
});
