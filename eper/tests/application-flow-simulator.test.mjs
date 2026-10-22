import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationRegistryService } from "../dist/packages/tenant/application-registry.js";
import { ApplicationFlowSimulator } from "../dist/packages/tenant/application-flow-simulator.js";

function setup() {
  const registry = new ApplicationRegistryService();
  const source = registry.create({ tenantId: "tenant-a", name: "Orders", slug: "orders" });
  const target = registry.create({ tenantId: "tenant-a", name: "Inventory", slug: "inventory" });
  const other = registry.create({ tenantId: "tenant-b", name: "Private", slug: "private" });
  const flow = {
    flowId: "order-to-inventory", tenantId: "tenant-a", name: "Order to inventory",
    steps: [
      { stepId: "s1", name: "Transform event", kind: "transform", sourceApplicationId: source.applicationId, targetApplicationId: target.applicationId },
      { stepId: "s2", name: "Validate event", kind: "validate", sourceApplicationId: source.applicationId, targetApplicationId: target.applicationId },
      { stepId: "s3", name: "Route event", kind: "route", sourceApplicationId: source.applicationId, targetApplicationId: target.applicationId },
      { stepId: "s4", name: "Write audit trace", kind: "audit", sourceApplicationId: source.applicationId, targetApplicationId: target.applicationId },
    ],
  };
  return { registry, source, target, other, flow, simulator: new ApplicationFlowSimulator(registry) };
}

test("successful flow produces simulated evidence and unique identifiers", () => {
  const { simulator, flow } = setup();
  const run = simulator.simulate("tenant-a", flow);
  assert.equal(run.status, "SIMULATED_SUCCESS");
  assert.equal(run.evidenceMode, "SIMULATED");
  assert.equal(run.note, "NO_EXTERNAL_SIDE_EFFECTS");
  assert.equal(new Set([run.runId, run.eventId, run.correlationId]).size, 3);
  assert.ok(run.steps.every((step) => step.status === "SIMULATED_SUCCESS"));
  assert.equal(simulator.getRun("tenant-a", run.runId).runId, run.runId);
});

test("validation fault fails at validation and skips downstream steps", () => {
  const { simulator, flow } = setup();
  const run = simulator.simulate("tenant-a", flow, "validation");
  assert.equal(run.status, "SIMULATED_FAILED");
  assert.equal(run.steps[0].status, "SIMULATED_SUCCESS");
  assert.equal(run.steps[1].status, "SIMULATED_FAILED");
  assert.equal(run.steps[2].status, "SKIPPED");
  assert.equal(run.steps[3].status, "SKIPPED");
});

test("authorization denial and timeout are deterministic simulated failures", () => {
  const { simulator, flow } = setup();
  const denied = simulator.simulate("tenant-a", flow, "denied");
  assert.equal(denied.steps[2].status, "SIMULATED_FAILED");
  assert.equal(denied.steps[3].status, "SKIPPED");
  const timeout = simulator.simulate("tenant-a", flow, "timeout");
  assert.equal(timeout.steps[3].status, "SIMULATED_FAILED");
});

test("duplicate event IDs are rejected without replaying the flow", () => {
  const { simulator, flow } = setup();
  const first = simulator.simulate("tenant-a", flow, "none", "event-123");
  const duplicate = simulator.simulate("tenant-a", flow, "none", "event-123");
  assert.equal(first.status, "SIMULATED_SUCCESS");
  assert.equal(duplicate.status, "SIMULATED_FAILED");
  assert.equal(duplicate.steps[0].status, "SIMULATED_FAILED");
  assert.notEqual(first.runId, duplicate.runId);
});

test("tenant mismatch and cross-tenant application references are rejected", () => {
  const { simulator, flow, other } = setup();
  assert.throws(() => simulator.simulate("tenant-b", flow), /FLOW_TENANT_SCOPE_MISMATCH/);
  const invalid = { ...flow, steps: [{ ...flow.steps[0], targetApplicationId: other.applicationId }] };
  assert.throws(() => simulator.simulate("tenant-a", invalid), /APPLICATION_NOT_FOUND/);
  const run = simulator.simulate("tenant-a", flow);
  assert.throws(() => simulator.getRun("tenant-b", run.runId), /SIMULATION_RUN_NOT_FOUND/);
  assert.equal(simulator.listRuns("tenant-b").length, 0);
});

test("archived applications and invalid flow definitions are rejected", () => {
  const { registry, source, simulator, flow } = setup();
  registry.update("tenant-a", source.applicationId, { lifecycle: "ARCHIVED" });
  assert.throws(() => simulator.simulate("tenant-a", flow), /FLOW_APPLICATION_UNAVAILABLE/);
  assert.throws(() => simulator.simulate("tenant-a", { ...flow, steps: [] }), /FLOW_DEFINITION_INVALID/);
});
