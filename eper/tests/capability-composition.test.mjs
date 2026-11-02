import test from "node:test";
import assert from "node:assert/strict";
import { validateCapabilityComposition } from "../dist/packages/workflows/capability-composition.js";

const catalogue = [
  { typeId: "activity.approval", contractVersion: 1, kind: "activity", label: "Approval", description: "Human approval",
    inputs: [{ id: "request", label: "Request details", valueType: "record", required: true }],
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

test("rejects cycles, unsafe control transitions and integrations without idempotency", () => {
  const graph = {
    entryNodeId: "approve",
    nodes: [
      base.nodes[0],
      { ...base.nodes[1], configuration: {} },
    ],
    edges: [
      base.edges[0],
      { id: "back", kind: "control", fromNodeId: "notify", fromPortId: "unknown", toNodeId: "approve", toPortId: "request" },
    ],
  };
  const codes = validateCapabilityComposition(graph, catalogue).map(item => item.code);
  assert.ok(codes.includes("composition.integration.idempotency_required"));
  assert.ok(codes.includes("composition.control.outcome"));
});
