import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowConfigurationService } from "../dist/packages/workflows/workflow-configuration.js";

test("workflow configuration service validates references and isolates returned state", () => {
  const service = new WorkflowConfigurationService();
  service.replaceRoles([{
    id: "approver", name: "Approver", members: ["principal-1"], permissions: ["workflow:view", "workflow:approve"],
  }]);
  const input = [{
    id: "fee-approval", name: "Fee approval", status: "ACTIVE", activities: [{
      id: "review", title: "Review request", type: "APPROVAL", roleId: "approver",
      permission: "workflow:approve", nextActivityIds: [],
      fields: [{ id: "reason", label: "Reason", type: "textarea", required: true }],
    }],
  }];
  const saved = service.replaceWorkflows(input);
  saved[0].activities[0].title = "mutated response";
  assert.equal(service.listWorkflows()[0].activities[0].title, "Review request");
  assert.throws(() => service.replaceWorkflows([{
    ...input[0], activities: [{ ...input[0].activities[0], nextActivityIds: ["missing"] }],
  }]), /invalid_or_duplicate_workflow_activity/);
  assert.throws(() => service.replaceRoles([]), /active_workflow_role_cannot_be_removed/);
});

test("access policy denies unknown principals, permissions, missing and inactive workflows", () => {
  const service = new WorkflowConfigurationService();
  service.replaceRoles([{
    id: "reader", name: "Reader", members: ["principal-1"], permissions: ["workflow:view"],
  }]);
  service.replaceWorkflows([{
    id: "draft-flow", name: "Draft flow", status: "DRAFT", activities: [],
  }]);
  assert.equal(service.checkAccess("unknown", "workflow:view").allowed, false);
  assert.equal(service.checkAccess("principal-1", "workflow:view").allowed, true);
  assert.equal(service.checkAccess("principal-1", "workflow:view", "missing").allowed, false);
  assert.equal(service.checkAccess("principal-1", "workflow:view", "draft-flow").allowed, false);
});

test("workflow configuration enforces bounded collections and rejects unsafe field definitions", () => {
  const service = new WorkflowConfigurationService();
  service.replaceRoles([{ id: "editor", name: "Editor", members: ["p1"], permissions: ["workflow:act"] }]);
  assert.throws(() => service.replaceWorkflows(new Array(WorkflowConfigurationService.MAX_WORKFLOWS + 1).fill(null)), /workflow_configuration_capacity_exceeded/);
  assert.throws(() => service.replaceWorkflows([{
    id: "flow", name: "Flow", status: "DRAFT", activities: [{
      id: "task", title: "Task", type: "TASK", roleId: "editor", permission: "workflow:act",
      nextActivityIds: [], fields: [{ id: "unsafe", label: "Unsafe", type: "select", options: null }],
    }],
  }]), /invalid_workflow_form_field/);
});
