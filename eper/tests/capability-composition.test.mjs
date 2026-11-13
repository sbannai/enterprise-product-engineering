import test from "node:test";
import assert from "node:assert/strict";
import { validateCapabilityComposition } from "../dist/packages/workflows/capability-composition.js";
import { assertWorkflowCapabilityComposition } from "../dist/packages/workflows/workflow-capability-adapter.js";

const catalogue = [
  { typeId: "activity.approval", contractVersion: 1, kind: "activity", label: "Approval", description: "Human approval",
    inputs: [{ id: "request", label: "Request details", valueType: "record", required: true }, { id: "trigger", label: "When started", valueType: "event" }],
    outputs: [{ id: "decision", label: "Decision", valueType: "record" }],
    outcomes: [{ id: "approved", label: "Approved" }, { id: "rejected", label: "Rejected" }],
    sideEffect: "none" },
  { typeId: "integration.notify", contractVersion: 1, kind: "integration", label: "Send notification", description: "Notify requester",
    inputs: [{ id: "trigger", label: "When approved", valueType: "event", required: true }],
    outputs: [], outcomes: [], sideEffect: "external", requiresIdempotency: true },
  { typeId: "reporting.pending", contractVersion: 1, kind: "reporting", label: "Pending approvals", description: "Read-only count",
    inputs: [], outputs: [{ id: "count", label: "Pending count", valueType: "number" }], outcomes: [], sideEffect: "none" },
];
const base = {
  entryNodeId: "approve",
  nodes: [
    { id: "approve", capabilityTypeId: "activity.approval", contractVersion: 1, label: "Manager approval", configuration: { request: { id: "REQ-1" } } },
    { id: "notify", capabilityTypeId: "integration.notify", contractVersion: 1, label: "Notify requester", configuration: { idempotencyPolicy: "event-id" } },
  ],
  edges: [{ id: "e1", kind: "control", fromNodeId: "approve", fromPortId: "approved", toNodeId: "notify", toPortId: "trigger" }],
};

test("accepts a compatible, configured activity-to-integration composition", () => {
  assert.deepEqual(validateCapabilityComposition(base, catalogue), []);
});

test("rejects unknown capability versions and missing required inputs", () => {
  const invalid = { ...base, nodes: [
    { ...base.nodes[0], contractVersion: 99, configuration: {} },
    base.nodes[1],
  ] };
  const codes = validateCapabilityComposition(invalid, catalogue).map(item => item.code);
  assert.ok(codes.includes("composition.capability.unsupported"));
  assert.ok(codes.includes("composition.edge.endpoint"));
});

test("rejects incompatible data ports and implicit type coercion", () => {
  const graph = {
    ...base,
    nodes: [
      { ...base.nodes[0], configuration: {} },
      { ...base.nodes[1], configuration: { idempotencyPolicy: "event-id" } },
      { id: "report", capabilityTypeId: "reporting.pending", contractVersion: 1, label: "Pending count", configuration: {} },
    ],
    edges: [{ id: "bad", kind: "data", fromNodeId: "report", fromPortId: "count", toNodeId: "approve", toPortId: "request" }],
  };
  assert.ok(validateCapabilityComposition(graph, catalogue).some(item => item.code === "composition.port.incompatible"));
});

test("rejects control-flow cycles and integrations without idempotency", () => {
  const secondApproval = { ...base.nodes[0], id: "approve2", label: "Second approval" };
  const graph = {
    entryNodeId: "approve",
    nodes: [base.nodes[0], secondApproval],
    edges: [
      { id: "forward", kind: "control", fromNodeId: "approve", fromPortId: "approved", toNodeId: "approve2", toPortId: "trigger" },
      { id: "back", kind: "control", fromNodeId: "approve2", fromPortId: "approved", toNodeId: "approve", toPortId: "trigger" },
    ],
  };
  const codes = validateCapabilityComposition(graph, catalogue).map(item => item.code);
  assert.ok(codes.includes("composition.control.cycle"));

  const missingIdempotency = { ...base, nodes: [base.nodes[0], { ...base.nodes[1], configuration: {} }] };
  assert.ok(validateCapabilityComposition(missingIdempotency, catalogue)
    .some(item => item.code === "composition.integration.idempotency_required"));
});


import {
  adaptWorkflowDefinitionToComposition,
  WORKFLOW_CAPABILITY_CATALOGUE,
  WORKFLOW_CAPABILITY_CATALOGUE_VERSION,
} from "../dist/packages/workflows/workflow-capability-adapter.js";

test("platform catalogue is versioned and adapts a simple legacy activity graph", () => {
  assert.equal(WORKFLOW_CAPABILITY_CATALOGUE_VERSION, "1.0.0");
  assert.deepEqual(
    WORKFLOW_CAPABILITY_CATALOGUE.map(item => item.kind).filter((kind, index, all) => all.indexOf(kind) === index).sort(),
    ["activity", "integration", "reporting", "rule"],
  );
  const definition = {
    id: "leave-flow", name: "Leave flow", status: "DRAFT",
    activities: [
      { id: "submit", title: "Submit", type: "FORM", roleId: "employee", permission: "workflow:act", nextActivityIds: ["approve"], fields: [{ id: "days", type: "number", required: true }] },
      { id: "approve", title: "Approve", type: "APPROVAL", roleId: "manager", permission: "workflow:approve", nextActivityIds: [], fields: [] },
    ],
  };
  const result = adaptWorkflowDefinitionToComposition(definition);
  assert.ok(result.composition);
  assert.equal(result.composition.entryNodeId, "submit");
  assert.deepEqual(result.diagnostics, []);
});

test("adapter preserves rule condition and rejects mixed routing it cannot represent", () => {
  const definition = {
    id: "expense-flow", name: "Expense flow", status: "DRAFT",
    activities: [
      { id: "start", title: "Start", type: "FORM", roleId: "employee", permission: "workflow:act", nextActivityIds: ["approve", "reject", "archive"], fields: [],
        routingRuleIds: ["high", "low"] },
      { id: "approve", title: "Approve", type: "APPROVAL", roleId: "manager", permission: "workflow:approve", nextActivityIds: [], fields: [] },
      { id: "reject", title: "Reject", type: "TASK", roleId: "finance", permission: "workflow:act", nextActivityIds: [], fields: [] },
      { id: "archive", title: "Archive", type: "TASK", roleId: "finance", permission: "workflow:act", nextActivityIds: [], fields: [] },
    ],
    rules: [
      { id: "high", name: "High value", priority: 20, targetActivityId: "approve", condition: { kind: "condition", field: "amount", operator: "gte", value: 1000 } },
      { id: "low", name: "Low value", priority: 10, targetActivityId: "reject", condition: { kind: "condition", field: "amount", operator: "lt", value: 1000 } },
    ],
  };
  const result = adaptWorkflowDefinitionToComposition(definition);
  assert.equal(result.composition, null);
  assert.ok(result.diagnostics.some(item => item.code === "workflow.adapter.priority_routing_not_representable"));
});


test("rejects valid capability nodes disconnected from the declared entry", () => {
  const graph = {
    ...base,
    nodes: [
      ...base.nodes,
      { id: "orphan-report", capabilityTypeId: "reporting.pending", contractVersion: 1,
        label: "Unreachable report", configuration: {} },
    ],
  };
  const diagnostics = validateCapabilityComposition(graph, catalogue);
  assert.ok(diagnostics.some(item =>
    item.code === "composition.node.unreachable" && item.nodeId === "orphan-report"));
});


test("adapter returns a blocking diagnostic for malformed runtime arrays", () => {
  const malformed = {
    id: "malformed-flow", name: "Malformed flow", status: "DRAFT",
    activities: [{
      id: "start", title: "Start", type: "FORM", roleId: "employee",
      permission: "workflow:act", nextActivityIds: null, fields: [],
    }],
    rules: [],
  };
  const result = adaptWorkflowDefinitionToComposition(malformed);
  assert.equal(result.composition, null);
  assert.ok(result.diagnostics.some(item => item.code === "workflow.adapter.input_shape_invalid"));
});


test("adapter fails closed for pure priority routing instead of creating parallel branches", () => {
  const definition = {
    id: "priority-flow", name: "Priority flow", status: "DRAFT",
    activities: [
      { id: "start", title: "Start", type: "FORM", roleId: "employee", permission: "workflow:act",
        nextActivityIds: ["preferred", "fallback"], fields: [], routingRuleIds: ["preferred-rule", "fallback-rule"] },
      { id: "preferred", title: "Preferred", type: "TASK", roleId: "ops", permission: "workflow:act", nextActivityIds: [], fields: [] },
      { id: "fallback", title: "Fallback", type: "TASK", roleId: "ops", permission: "workflow:act", nextActivityIds: [], fields: [] },
    ],
    rules: [
      { id: "preferred-rule", name: "Preferred", priority: 20, targetActivityId: "preferred", condition: { kind: "condition", field: "score", operator: "gte", value: 80 } },
      { id: "fallback-rule", name: "Fallback", priority: 10, targetActivityId: "fallback", condition: { kind: "condition", field: "score", operator: "lt", value: 80 } },
    ],
  };
  const result = adaptWorkflowDefinitionToComposition(definition);
  assert.equal(result.composition, null);
  assert.ok(result.diagnostics.some(item => item.code === "workflow.adapter.priority_routing_not_representable"));
});


test("shared lifecycle gate accepts a representable single-activity draft", () => {
  const result = assertWorkflowCapabilityComposition({
    id: "expense-approval", name: "Expense approval", status: "DRAFT",
    activities: [{
      id: "submit", title: "Submit expense", type: "FORM", roleId: "requester",
      permission: "workflow:act", nextActivityIds: [], fields: [],
    }],
  });
  assert.equal(result.catalogueVersion, "1.0.0");
  assert.equal(result.composition.nodes.length, 1);
  assert.deepEqual(result.diagnostics, []);
});

test("shared lifecycle gate rejects priority routing rather than persisting a fan-out graph", () => {
  assert.throws(() => assertWorkflowCapabilityComposition({
    id: "expense-approval", name: "Expense approval", status: "DRAFT",
    activities: [{
      id: "review", title: "Review expense", type: "APPROVAL", roleId: "finance",
      permission: "workflow:approve", nextActivityIds: [], routingRuleIds: ["high-value"],
      fields: [],
    }],
    rules: [{
      id: "high-value", name: "High value", priority: 10, targetActivityId: "review",
      condition: { kind: "condition", field: "amount", operator: "greater_than", value: 1000 },
    }],
  }), /WORKFLOW_CAPABILITY_COMPOSITION_INVALID:workflow.adapter.priority_routing_not_representable/);
});


test("capability composition blocks dependency-bearing descriptors until a persisted execution-time gate exists", () => {
  const withDependency = catalogue.map(item => item.typeId === "integration.notify"
    ? { ...item, dependencyIds: ["vendor.workflow.sdk"] } : item);
  const diagnostics = validateCapabilityComposition(base, withDependency);
  assert.ok(diagnostics.some(item =>
    item.code === "composition.dependency.runtime_gate_required" && item.nodeId === "notify"));
});

test("capability composition rejects malformed dependency ID declarations", () => {
  const withDependency = catalogue.map(item => item.typeId === "integration.notify"
    ? { ...item, dependencyIds: ["vendor.workflow.sdk", "vendor.workflow.sdk"] } : item);
  const diagnostics = validateCapabilityComposition(base, withDependency);
  assert.ok(diagnostics.some(item =>
    item.code === "composition.dependency.declaration_invalid" && item.nodeId === "notify"));
});
