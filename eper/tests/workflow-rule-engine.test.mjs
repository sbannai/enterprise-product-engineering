import test from "node:test";
import assert from "node:assert/strict";
import { chooseNextWorkflowActivity, resolveWorkflowNextActivity } from "../dist/packages/workflows/postgres-workflow-execution-service.js";
import {
  WorkflowConfigurationError,
  WorkflowConfigurationService,
  evaluateWorkflowRuleExpression,
  evaluateWorkflowRoutingRules,
  validateWorkflowRuleConfiguration,
} from "../dist/packages/workflows/workflow-configuration.js";

const definition = {
  id: "purchase-approval",
  name: "Purchase approval",
  status: "ACTIVE",
  activities: [
    { id: "intake", title: "Intake", type: "FORM", roleId: "requester", permission: "workflow:act",
      nextActivityIds: ["manager", "finance", "standard"], fields: [],
      routingRuleIds: ["high-value", "mid-value", "default"] },
    { id: "manager", title: "Manager review", type: "APPROVAL", roleId: "manager", permission: "workflow:approve", nextActivityIds: [], fields: [] },
    { id: "finance", title: "Finance review", type: "APPROVAL", roleId: "finance", permission: "workflow:approve", nextActivityIds: [], fields: [] },
    { id: "standard", title: "Standard processing", type: "TASK", roleId: "processor", permission: "workflow:act", nextActivityIds: [], fields: [] },
  ],
  rules: [
    { id: "high-value", name: "High value", priority: 100,
      targetActivityId: "finance", condition: { kind: "condition", field: "purchase.amount", operator: "gte", value: 10000 } },
    { id: "mid-value", name: "Manager threshold", priority: 50,
      targetActivityId: "manager", condition: { kind: "all", conditions: [
        { kind: "condition", field: "purchase.amount", operator: "gte", value: 1000 },
        { kind: "condition", field: "purchase.amount", operator: "lt", value: 10000 },
      ] } },
    { id: "default", name: "Standard", priority: 1,
      targetActivityId: "standard", condition: { kind: "not", condition: { kind: "condition", field: "purchase.amount", operator: "gte", value: 1000 } } },
  ],
};

test("rule engine evaluates typed nested conditions without executing user code", () => {
  assert.equal(evaluateWorkflowRuleExpression(
    { kind: "all", conditions: [
      { kind: "condition", field: "purchase.amount", operator: "gte", value: 500 },
      { kind: "condition", field: "purchase.currency", operator: "in", value: ["INR", "USD"] },
      { kind: "condition", field: "purchase.reference", operator: "exists" },
    ] },
    { purchase: { amount: 750, currency: "INR", reference: "PO-1" } },
  ), true);
  assert.equal(evaluateWorkflowRuleExpression(
    { kind: "condition", field: "purchase.amount", operator: "gt", value: 500 },
    { purchase: { amount: "750" } },
  ), false, "numeric comparisons must not coerce strings");
});

test("routing rules choose the highest-priority matching target deterministically", () => {
  validateWorkflowRuleConfiguration(definition);
  const activity = definition.activities[0];
  assert.equal(evaluateWorkflowRoutingRules(definition, activity, { purchase: { amount: 15000 } }).targetActivityId, "finance");
  assert.equal(evaluateWorkflowRoutingRules(definition, activity, { purchase: { amount: 2500 } }).targetActivityId, "manager");
  assert.equal(evaluateWorkflowRoutingRules(definition, activity, { purchase: { amount: 250 } }).targetActivityId, "standard");
});

test("routing rules reject no-match and equal-priority ambiguity instead of guessing", () => {
  const activity = { ...definition.activities[0], routingRuleIds: ["high-value"] };
  assert.throws(() => evaluateWorkflowRoutingRules(definition, activity, { purchase: { amount: 5 } }),
    error => error instanceof WorkflowConfigurationError && error.message === "workflow_rule_no_route_matched");
  const ambiguous = {
    ...definition,
    rules: [
      { id: "a", name: "A", priority: 10, targetActivityId: "manager", condition: { kind: "condition", field: "flag", operator: "eq", value: true } },
      { id: "b", name: "B", priority: 10, targetActivityId: "finance", condition: { kind: "condition", field: "flag", operator: "eq", value: true } },
    ],
  };
  assert.throws(() => evaluateWorkflowRoutingRules(ambiguous, { ...activity, routingRuleIds: ["a", "b"] }, { flag: true }),
    error => error instanceof WorkflowConfigurationError && error.message === "workflow_rule_route_ambiguous");
});

test("rule validation rejects unsafe paths, unknown targets and dangling activity references", () => {
  const unsafe = { ...definition, rules: [{ ...definition.rules[0], condition: { kind: "condition", field: "__proto__.x", operator: "exists" } }] };
  assert.throws(() => validateWorkflowRuleConfiguration(unsafe), /invalid_workflow_rule/);
  const badTarget = { ...definition, rules: [{ ...definition.rules[0], targetActivityId: "outside-tenant" }] };
  assert.throws(() => validateWorkflowRuleConfiguration(badTarget), /invalid_workflow_rule/);
  const dangling = { ...definition, activities: [{ ...definition.activities[0], routingRuleIds: ["missing"] }, ...definition.activities.slice(1)] };
  assert.throws(() => validateWorkflowRuleConfiguration(dangling), /invalid_workflow_activity_rule_reference/);
});

test("workflow configuration service validates rule graph before accepting a draft", () => {
  const service = new WorkflowConfigurationService();
  service.replaceRoles([
    { id: "requester", name: "Requester", members: ["actor-1"], permissions: ["workflow:act"] },
    { id: "manager", name: "Manager", members: ["actor-2"], permissions: ["workflow:approve"] },
    { id: "finance", name: "Finance", members: ["actor-3"], permissions: ["workflow:approve"] },
    { id: "processor", name: "Processor", members: ["actor-4"], permissions: ["workflow:act"] },
  ]);
  assert.equal(service.replaceWorkflows([definition])[0].rules.length, 3);
  assert.throws(() => service.replaceWorkflows([{ ...definition, rules: [{ ...definition.rules[0], targetActivityId: "not-a-step" }] }]),
    /invalid_workflow_rule/);
});


test("workflow transition service uses the pinned definition rules instead of client-selected branches", () => {
  const activity = definition.activities[0];
  assert.equal(chooseNextWorkflowActivity(definition, activity, { purchase: { amount: 12000 } }), "finance");
  assert.equal(chooseNextWorkflowActivity(definition, activity, { purchase: { amount: 3000 } }), "manager");
  const trace = resolveWorkflowNextActivity(definition, activity, { purchase: { amount: 12000 } }).ruleDecision;
  assert.equal(trace.matchedRuleId, "high-value");
  assert.deepEqual(trace.evaluated, [
    { ruleId: "high-value", matched: true },
    { ruleId: "mid-value", matched: false },
    { ruleId: "default", matched: false },
  ]);
  assert.throws(
    () => chooseNextWorkflowActivity(definition, activity, { purchase: { amount: 12000 } }, "standard"),
    /WORKFLOW_EXECUTION_RULE_TARGET_MISMATCH/,
  );
});
