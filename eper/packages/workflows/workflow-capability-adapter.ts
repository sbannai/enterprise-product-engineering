import type { WorkflowActivity, WorkflowDefinition, WorkflowRule } from "./workflow-configuration.js";
import {
  validateCapabilityComposition,
  type CapabilityComposition,
  type CapabilityDescriptor,
  type CompositionDiagnostic,
} from "./capability-composition.js";

export const WORKFLOW_CAPABILITY_CATALOGUE_VERSION = "1.0.0";

/**
 * Platform-owned descriptors. Customer-authored workflow JSON can select these
 * types but can never supply or override their contracts.
 */
export const WORKFLOW_CAPABILITY_CATALOGUE: readonly CapabilityDescriptor[] = Object.freeze([
  {
    typeId: "workflow.activity.task", contractVersion: 1, kind: "activity",
    label: "Task", description: "A user-performed workflow task",
    inputs: [{ id: "trigger", label: "Start event", valueType: "event" }],
    outputs: [{ id: "result", label: "Task result", valueType: "record" }],
    outcomes: [{ id: "completed", label: "Completed" }], sideEffect: "none",
  },
  {
    typeId: "workflow.activity.form", contractVersion: 1, kind: "activity",
    label: "Form", description: "A user-completed workflow form",
    inputs: [{ id: "trigger", label: "Start event", valueType: "event" }],
    outputs: [{ id: "result", label: "Form result", valueType: "record" }],
    outcomes: [{ id: "completed", label: "Completed" }], sideEffect: "none",
  },
  {
    typeId: "workflow.activity.approval", contractVersion: 1, kind: "activity",
    label: "Approval", description: "A human approval step",
    inputs: [{ id: "trigger", label: "Start event", valueType: "event" }],
    outputs: [{ id: "decision", label: "Approval decision", valueType: "record" }],
    outcomes: [{ id: "completed", label: "Completed" }], sideEffect: "none",
  },
  {
    typeId: "workflow.rule.condition", contractVersion: 1, kind: "rule",
    label: "Condition", description: "A deterministic workflow routing condition",
    inputs: [{ id: "trigger", label: "Evaluation event", valueType: "event" }],
    outputs: [], outcomes: [
      { id: "matched", label: "Matched" }, { id: "not-matched", label: "Not matched" },
    ], sideEffect: "none",
  },
  {
    typeId: "workflow.integration.external", contractVersion: 1, kind: "integration",
    label: "External integration", description: "An explicitly configured external side effect",
    inputs: [{ id: "trigger", label: "Dispatch event", valueType: "event", required: true }],
    outputs: [], outcomes: [], sideEffect: "external", requiresIdempotency: true,
  },
  {
    typeId: "workflow.reporting.read-only", contractVersion: 1, kind: "reporting",
    label: "Read-only report", description: "A read-only workflow report",
    inputs: [], outputs: [{ id: "result", label: "Report result", valueType: "record" }],
    outcomes: [], sideEffect: "none",
  },
]);

export interface WorkflowCompositionResult {
  catalogueVersion: string;
  composition: CapabilityComposition | null;
  diagnostics: CompositionDiagnostic[];
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function invalid(code: string, message: string, nodeId?: string): CompositionDiagnostic {
  return { code, message, ...(nodeId ? { nodeId } : {}), blocking: true };
}

/**
 * Loss-aware adapter for the currently supported legacy authoring model.
 * It never invents integrations/reports and rejects routing that cannot be
 * represented without changing the legacy priority/transition semantics.
 */
export function adaptWorkflowDefinitionToComposition(
  definition: WorkflowDefinition,
): WorkflowCompositionResult {
  const diagnostics: CompositionDiagnostic[] = [];
  if (!definition || !Array.isArray(definition.activities) || definition.activities.length < 1 ||
      definition.activities.length > 200 || !ID.test(definition.id ?? "")) {
    return { catalogueVersion: WORKFLOW_CAPABILITY_CATALOGUE_VERSION, composition: null,
      diagnostics: [invalid("workflow.adapter.definition_invalid", "The workflow definition cannot be represented as a capability composition.")] };
  }

  // Treat persisted/API JSON as untrusted at this boundary even though the
  // TypeScript interface is stricter. Return stable diagnostics, never runtime
  // TypeErrors from array operations on malformed customer input.
  if (!Array.isArray(definition.rules ?? []) ||
      definition.activities.some(activity => !activity ||
        !Array.isArray(activity.nextActivityIds) || !Array.isArray(activity.fields) ||
        (activity.routingRuleIds !== undefined && !Array.isArray(activity.routingRuleIds))) ||
      (definition.rules ?? []).some(rule => !rule || typeof rule !== "object" ||
        !ID.test(rule.id ?? "") || typeof rule.targetActivityId !== "string" ||
        !Number.isSafeInteger(rule.priority) || !rule.condition || typeof rule.condition !== "object")) {
    return { catalogueVersion: WORKFLOW_CAPABILITY_CATALOGUE_VERSION, composition: null,
      diagnostics: [invalid("workflow.adapter.input_shape_invalid",
        "Workflow activities and routing rules must contain valid arrays and rule fields.")] };
  }

  const activityIds = new Set<string>();
  const ruleIds = new Set<string>();
  const nodes: CapabilityComposition["nodes"] = [];
  const edges: CapabilityComposition["edges"] = [];
  const activities = new Map<string, WorkflowActivity>();
  const rules = new Map<string, WorkflowRule>((definition.rules ?? []).map(rule => [rule.id, rule]));

  for (const activity of definition.activities) {
    if (!activity || !ID.test(activity.id ?? "") || activityIds.has(activity.id) ||
        !["TASK", "FORM", "APPROVAL"].includes(activity.type)) {
      diagnostics.push(invalid("workflow.adapter.activity_unsupported", "An activity is invalid or uses an unsupported activity type.", activity?.id));
      continue;
    }
    activityIds.add(activity.id);
    activities.set(activity.id, activity);
    const typeId = activity.type === "TASK" ? "workflow.activity.task"
      : activity.type === "FORM" ? "workflow.activity.form" : "workflow.activity.approval";
    nodes.push({
      id: activity.id, capabilityTypeId: typeId, contractVersion: 1, label: activity.title,
      configuration: {
        roleId: activity.roleId, permission: activity.permission,
        fields: structuredClone(activity.fields),
      },
    });
  }

  for (const rule of definition.rules ?? []) {
    if (!rule || !ID.test(rule.id ?? "") || ruleIds.has(rule.id) ||
        !activities.has(rule.targetActivityId) || !Number.isSafeInteger(rule.priority)) {
      diagnostics.push(invalid("workflow.adapter.rule_unsupported", "A routing rule is invalid or targets an unsupported activity.", rule?.id));
      continue;
    }
    ruleIds.add(rule.id);
    nodes.push({
      id: "rule." + rule.id, capabilityTypeId: "workflow.rule.condition", contractVersion: 1,
      label: rule.name,
      configuration: { priority: rule.priority, targetActivityId: rule.targetActivityId, condition: structuredClone(rule.condition) },
    });
  }

  for (const activity of definition.activities) {
    if (!activities.has(activity.id)) continue;
    const refs = activity.routingRuleIds ?? [];
    if (refs.length > 0) {
      const ordered = refs.map(id => rules.get(id));
      if (ordered.some(rule => !rule) || new Set(refs).size !== refs.length) {
        diagnostics.push(invalid("workflow.adapter.rule_reference_unsupported", "Routing references are missing or duplicated.", activity.id));
        continue;
      }
      // Legacy evaluation chooses the highest-priority matching rule. The graph
      // represents each configured rule as an explicit branch, retaining order.
      for (const rule of ordered as WorkflowRule[]) {
        if (!ruleIds.has(rule.id)) continue;
        edges.push({
          id: "edge.route." + activity.id + "." + rule.id, kind: "control",
          fromNodeId: activity.id, fromPortId: "completed",
          toNodeId: "rule." + rule.id, toPortId: "trigger",
        });
        edges.push({
          id: "edge.match." + rule.id, kind: "control",
          fromNodeId: "rule." + rule.id, fromPortId: "matched",
          toNodeId: rule.targetActivityId, toPortId: "trigger",
        });
      }
      // An activity with rule routing must not also contain unmodelled direct
      // transitions; those would bypass the legacy rule selection semantics.
      if (activity.nextActivityIds.some(id => !ordered.some(rule => rule?.targetActivityId === id))) {
        diagnostics.push(invalid("workflow.adapter.mixed_routing_unsupported", "Direct transitions mixed with rule routing cannot be represented without changing route selection.", activity.id));
      }
    } else {
      for (const targetId of activity.nextActivityIds) {
        edges.push({
          id: "edge.next." + activity.id + "." + targetId, kind: "control",
          fromNodeId: activity.id, fromPortId: "completed",
          toNodeId: targetId, toPortId: "trigger",
        });
      }
    }
  }

  const entries = definition.activities.filter(activity =>
    !definition.activities.some(candidate => candidate.nextActivityIds.includes(activity.id)));
  const entry = entries.length === 1 ? entries[0] : undefined;
  if (!entry || !activities.has(entry.id)) {
    diagnostics.push(invalid("workflow.adapter.entry_ambiguous", "The legacy workflow must have exactly one unambiguous starting activity."));
  }
  const referencedRules = new Set(definition.activities.flatMap(activity => activity.routingRuleIds ?? []));
  for (const rule of definition.rules ?? []) {
    if (!referencedRules.has(rule.id)) {
      diagnostics.push(invalid("workflow.adapter.orphan_rule", "An unused rule cannot be represented as an executable workflow capability.", rule.id));
    }
  }
  if (diagnostics.length > 0 || !entry) {
    return { catalogueVersion: WORKFLOW_CAPABILITY_CATALOGUE_VERSION, composition: null, diagnostics };
  }

  const composition: CapabilityComposition = { entryNodeId: entry.id, nodes, edges };
  const validation = validateCapabilityComposition(composition, WORKFLOW_CAPABILITY_CATALOGUE);
  return { catalogueVersion: WORKFLOW_CAPABILITY_CATALOGUE_VERSION, composition,
    diagnostics: [...diagnostics, ...validation] };
}
