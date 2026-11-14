export type WorkflowPermission =
  | "workflow:view"
  | "workflow:act"
  | "workflow:approve"
  | "workflow:admin"
  | "role:assign"
  | "access:manage";

export type WorkflowFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "json";
export function workflowPermissionGranted(granted: readonly WorkflowPermission[], permission: WorkflowPermission): boolean {
  return granted.includes(permission) ||
    ((permission === "workflow:view" || permission === "workflow:act") && granted.includes("workflow:admin"));
}

export interface WorkflowField {
  id: string;
  label?: string;
  type: WorkflowFieldType;
  required?: boolean;
  options?: string[];
}
export interface WorkflowApplicationDataBinding {
  requirementId: string;
  entityType: string;
  operation: "create" | "update" | "delete";
  recordIdField?: string;
  expectedVersionField?: string;
  dataField?: string;
  resultKey?: string;
}
export interface WorkflowActivity {
  id: string;
  title: string;
  type: "TASK" | "FORM" | "APPROVAL";
  roleId: string;
  permission: "workflow:act" | "workflow:approve";
  nextActivityIds: string[];
  fields: WorkflowField[];
  /** Rule IDs evaluated in priority order to choose a permitted outgoing transition. */
  routingRuleIds?: string[];
  /** Governed application-data mutation executed by the workflow worker after activity authorization. */
  applicationDataBinding?: WorkflowApplicationDataBinding;
}
export type WorkflowRuleOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "exists";
export type WorkflowRuleExpression =
  | { kind: "condition"; field: string; operator: WorkflowRuleOperator; value?: string | number | boolean | null | Array<string | number | boolean | null> }
  | { kind: "all" | "any"; conditions: WorkflowRuleExpression[] }
  | { kind: "not"; condition: WorkflowRuleExpression };

export interface WorkflowRule {
  id: string;
  name: string;
  priority: number;
  targetActivityId: string;
  condition: WorkflowRuleExpression;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE";
  activities: WorkflowActivity[];
  rules?: WorkflowRule[];
}

const RULE_FIELD_PATH = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*){0,7}$/;
const RULE_OPERATORS: readonly WorkflowRuleOperator[] = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "exists"];

function validRuleValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return Array.isArray(value) && value.length <= 100 &&
    value.every(item => item === null || typeof item === "string" || typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item)));
}

function validateExpression(expression: unknown, depth = 0): expression is WorkflowRuleExpression {
  if (!expression || typeof expression !== "object" || Array.isArray(expression) || depth > 8) return false;
  const item = expression as Record<string, unknown>;
  if (item.kind === "condition") {
    if (typeof item.field !== "string" || !RULE_FIELD_PATH.test(item.field) ||
        typeof item.operator !== "string" || !RULE_OPERATORS.includes(item.operator as WorkflowRuleOperator)) return false;
    if (item.operator === "exists") return item.value === undefined;
    return item.value !== undefined && validRuleValue(item.value);
  }
  if (item.kind === "not") return validateExpression(item.condition, depth + 1);
  return (item.kind === "all" || item.kind === "any") && Array.isArray(item.conditions) &&
    item.conditions.length > 0 && item.conditions.length <= 20 &&
    item.conditions.every(child => validateExpression(child, depth + 1));
}

/** Validate the rule graph independently so both draft validation and publication use identical rules. */
export function validateWorkflowRuleConfiguration(definition: WorkflowDefinition): void {
  const rules = definition.rules ?? [];
  if (!Array.isArray(rules) || rules.length > 200) {
    throw new WorkflowConfigurationError("invalid_workflow_rules", 400);
  }
  const ruleIds = new Set<string>();
  const activityIds = new Set(definition.activities.map(activity => activity.id));
  for (const rule of rules) {
    if (!rule || !/^[a-zA-Z0-9._-]{1,128}$/.test(rule.id) || ruleIds.has(rule.id) ||
        typeof rule.name !== "string" || !rule.name.trim() || rule.name.length > 200 ||
        !Number.isSafeInteger(rule.priority) || rule.priority < 0 || rule.priority > 1_000_000 ||
        !activityIds.has(rule.targetActivityId) || !validateExpression(rule.condition)) {
      throw new WorkflowConfigurationError("invalid_workflow_rule:" + (rule?.id ?? "unknown"), 400);
    }
    ruleIds.add(rule.id);
  }
  for (const activity of definition.activities) {
    const refs = activity.routingRuleIds ?? [];
    if (!Array.isArray(refs) || refs.length > 100 || new Set(refs).size !== refs.length ||
        refs.some(id => typeof id !== "string" || !ruleIds.has(id))) {
      throw new WorkflowConfigurationError("invalid_workflow_activity_rule_reference:" + activity.id, 400);
    }
    for (const ruleId of refs) {
      const rule = rules.find(candidate => candidate.id === ruleId)!;
      if (!activity.nextActivityIds.includes(rule.targetActivityId)) {
        throw new WorkflowConfigurationError("workflow_rule_target_not_allowed:" + ruleId, 422);
      }
    }
  }
}

function readRuleField(data: Record<string, unknown>, path: string): { exists: boolean; value: unknown } {
  let current: unknown = data;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) ||
        !Object.prototype.hasOwnProperty.call(current, segment)) return { exists: false, value: undefined };
    current = (current as Record<string, unknown>)[segment];
  }
  return { exists: true, value: current };
}

export function evaluateWorkflowRuleExpression(
  expression: WorkflowRuleExpression,
  data: Record<string, unknown>,
): boolean {
  if (expression.kind === "all") return expression.conditions.every(child => evaluateWorkflowRuleExpression(child, data));
  if (expression.kind === "any") return expression.conditions.some(child => evaluateWorkflowRuleExpression(child, data));
  if (expression.kind === "not") return !evaluateWorkflowRuleExpression(expression.condition, data);
  if (expression.kind !== "condition") return false;
  const field = readRuleField(data, expression.field);
  if (expression.operator === "exists") return field.exists;
  if (!field.exists) return false;
  const expected = expression.value;
  switch (expression.operator) {
    case "eq": return field.value === expected;
    case "neq": return field.value !== expected;
    case "gt": return typeof field.value === "number" && typeof expected === "number" && field.value > expected;
    case "gte": return typeof field.value === "number" && typeof expected === "number" && field.value >= expected;
    case "lt": return typeof field.value === "number" && typeof expected === "number" && field.value < expected;
    case "lte": return typeof field.value === "number" && typeof expected === "number" && field.value <= expected;
    case "in": return Array.isArray(expected) && expected.includes(field.value as never);
    case "contains": return typeof field.value === "string" && typeof expected === "string"
      ? field.value.includes(expected)
      : Array.isArray(field.value) && field.value.includes(expected as never);
    default: return false;
  }
}

export interface WorkflowRuleEvaluation {
  targetActivityId: string;
  matchedRuleId: string;
  evaluated: Array<{ ruleId: string; matched: boolean }>;
}

/** Highest priority wins; equal-priority matches are rejected rather than guessed. */
export function evaluateWorkflowRoutingRules(
  definition: WorkflowDefinition,
  activity: WorkflowActivity,
  data: Record<string, unknown>,
): WorkflowRuleEvaluation {
  const rules = definition.rules ?? [];
  const selected = (activity.routingRuleIds ?? []).map(id => rules.find(rule => rule.id === id))
    .filter((rule): rule is WorkflowRule => Boolean(rule))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const evaluated = selected.map(rule => ({ ruleId: rule.id, matched: evaluateWorkflowRuleExpression(rule.condition, data) }));
  const matches = selected.filter(rule => evaluateWorkflowRuleExpression(rule.condition, data));
  if (matches.length === 0) throw new WorkflowConfigurationError("workflow_rule_no_route_matched", 422);
  if (matches.length > 1 && matches[0].priority === matches[1].priority) {
    throw new WorkflowConfigurationError("workflow_rule_route_ambiguous", 422);
  }
  return { targetActivityId: matches[0].targetActivityId, matchedRuleId: matches[0].id, evaluated };
}

export interface WorkflowRole {
  id: string;
  name: string;
  description?: string;
  members: string[];
  permissions: WorkflowPermission[];
}
export interface AccessDecision {
  allowed: boolean;
  principalId: string;
  permission: WorkflowPermission;
  roles: string[];
  reason: string;
}
export class WorkflowConfigurationError extends Error {
  constructor(message: string, readonly statusCode: number = 400) {
    super(message);
    this.name = "WorkflowConfigurationError";
  }
}

/**
 * Owns workflow and role configuration invariants independently of HTTP transport.
 * The in-memory adapter is intentionally bounded and is not durable production storage.
 */
export class WorkflowConfigurationService {
  static readonly MAX_WORKFLOWS = 500;
  static readonly MAX_ACTIVITIES_PER_WORKFLOW = 200;
  static readonly MAX_FIELDS_PER_ACTIVITY = 100;
  static readonly MAX_ROLES = 500;
  static readonly MAX_MEMBERS_PER_ROLE = 10_000;
  static readonly MAX_SELECT_OPTIONS = 100;

  static readonly PERMISSIONS: readonly WorkflowPermission[] = [
    "workflow:view", "workflow:act", "workflow:approve", "workflow:admin", "role:assign", "access:manage",
  ];
  private workflows: WorkflowDefinition[] = [];
  private roles: WorkflowRole[] = [];

  listWorkflows(): WorkflowDefinition[] {
    return structuredClone(this.workflows);
  }

  replaceWorkflows(value: unknown): WorkflowDefinition[] {
    if (!Array.isArray(value)) throw new WorkflowConfigurationError("workflows_array_required");
    if (value.length > WorkflowConfigurationService.MAX_WORKFLOWS) {
      throw new WorkflowConfigurationError("workflow_configuration_capacity_exceeded", 413);
    }
    const candidate = value as WorkflowDefinition[];
    const ids = candidate.map((workflow) => workflow && workflow.id);
    if (candidate.some((workflow) => !workflow || !this.validId(workflow.id) ||
        !this.validLabel(workflow.name, 200) || !["DRAFT", "ACTIVE"].includes(workflow.status) ||
        (workflow.description !== undefined && (typeof workflow.description !== "string" || workflow.description.length > 2_000)) ||
        !Array.isArray(workflow.activities)) || new Set(ids).size !== ids.length) {
      throw new WorkflowConfigurationError("invalid_or_duplicate_workflow_definition");
    }

    for (const workflow of candidate) {
      if (workflow.activities.length > WorkflowConfigurationService.MAX_ACTIVITIES_PER_WORKFLOW) {
        throw new WorkflowConfigurationError("workflow_activity_capacity_exceeded:" + workflow.id, 413);
      }
      const activityIds = workflow.activities.map((activity) => activity && activity.id);
      if (new Set(activityIds).size !== activityIds.length) {
        throw new WorkflowConfigurationError("invalid_or_duplicate_workflow_activity");
      }
      for (const activity of workflow.activities) {
        if (!activity || !this.validId(activity.id) || !this.validLabel(activity.title, 200) ||
            !["TASK", "FORM", "APPROVAL"].includes(activity.type) || !this.validId(activity.roleId) ||
            !["workflow:act", "workflow:approve"].includes(activity.permission) ||
            !Array.isArray(activity.nextActivityIds) ||
            activity.nextActivityIds.some((id) => typeof id !== "string" || !activityIds.includes(id)) ||
            !Array.isArray(activity.fields) ||
            (activity.applicationDataBinding !== undefined && (
              !activity.applicationDataBinding ||
              !/^[a-zA-Z0-9._-]{1,128}$/.test(activity.applicationDataBinding.requirementId) ||
              !/^[a-zA-Z][a-zA-Z0-9._-]{1,128}$/.test(activity.applicationDataBinding.entityType) ||
              !["create", "update", "delete"].includes(activity.applicationDataBinding.operation) ||
              (activity.applicationDataBinding.recordIdField !== undefined && !this.validId(activity.applicationDataBinding.recordIdField)) ||
              (activity.applicationDataBinding.expectedVersionField !== undefined && !this.validId(activity.applicationDataBinding.expectedVersionField)) ||
              (activity.applicationDataBinding.dataField !== undefined && !this.validId(activity.applicationDataBinding.dataField)) ||
              (activity.applicationDataBinding.resultKey !== undefined && !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(activity.applicationDataBinding.resultKey))
            ))) {
          throw new WorkflowConfigurationError("invalid_or_duplicate_workflow_activity");
        }
        if (!this.roles.some((role) => role.id === activity.roleId)) {
          throw new WorkflowConfigurationError("workflow_activity_role_not_found:" + activity.roleId, 422);
        }
        if (activity.fields.length > WorkflowConfigurationService.MAX_FIELDS_PER_ACTIVITY) {
          throw new WorkflowConfigurationError("workflow_field_capacity_exceeded:" + activity.id, 413);
        }
        const fieldIds = activity.fields.map((field) => field && field.id);
        if (new Set(fieldIds).size !== fieldIds.length ||
            activity.fields.some((field) => !field || !this.validId(field.id) ||
              (field.label !== undefined && !this.validLabel(field.label, 200)) ||
              !["text", "textarea", "number", "date", "select", "checkbox"].includes(field.type) ||
              (field.required !== undefined && typeof field.required !== "boolean") ||
              (field.options !== undefined && (!Array.isArray(field.options) ||
                field.options.length > WorkflowConfigurationService.MAX_SELECT_OPTIONS ||
                field.options.some((option) => typeof option !== "string" || option.length > 200))) ||
              (field.type === "select" && !Array.isArray(field.options)))) {
          throw new WorkflowConfigurationError("invalid_workflow_form_field:" + activity.id);
        }
      }
      validateWorkflowRuleConfiguration(workflow);
    }
    this.workflows = structuredClone(candidate);
    return this.listWorkflows();
  }

  listRoles(): WorkflowRole[] {
    return structuredClone(this.roles);
  }

  replaceRoles(value: unknown): WorkflowRole[] {
    if (!Array.isArray(value)) throw new WorkflowConfigurationError("roles_array_required");
    if (value.length > WorkflowConfigurationService.MAX_ROLES) {
      throw new WorkflowConfigurationError("role_configuration_capacity_exceeded", 413);
    }
    const candidate = value as WorkflowRole[];
    const ids = candidate.map((role) => role && role.id);
    if (candidate.some((role) => !role || !this.validId(role.id) || !this.validLabel(role.name, 200) ||
        (role.description !== undefined && (typeof role.description !== "string" || role.description.length > 2_000)) ||
        !Array.isArray(role.members) || role.members.length > WorkflowConfigurationService.MAX_MEMBERS_PER_ROLE ||
        !Array.isArray(role.permissions) || role.permissions.some((permission) =>
          !(WorkflowConfigurationService.PERMISSIONS as readonly string[]).includes(permission)) ||
        new Set(role.permissions).size !== role.permissions.length ||
        role.members.some((member) => typeof member !== "string" || !member.trim() || member.length > 128) ||
        new Set(role.members).size !== role.members.length) || new Set(ids).size !== ids.length) {
      throw new WorkflowConfigurationError("invalid_or_duplicate_role_or_permission");
    }
    const nextIds = new Set(candidate.map((role) => role.id));
    for (const workflow of this.workflows) {
      if (workflow.status === "ACTIVE" && workflow.activities.some((activity) => !nextIds.has(activity.roleId))) {
        throw new WorkflowConfigurationError("active_workflow_role_cannot_be_removed:" + workflow.id, 409);
      }
    }
    this.roles = structuredClone(candidate);
    return this.listRoles();
  }

  checkAccess(principalId: string, permission: WorkflowPermission, workflowId?: string): AccessDecision {
    const matchingRoles = this.roles.filter((role) => role.members.includes(principalId));
    const granted = matchingRoles.some((role) => workflowPermissionGranted(role.permissions, permission));
    const workflow = workflowId === undefined ? undefined : this.workflows.find((item) => item.id === workflowId);
    const workflowMissing = workflowId !== undefined && !workflow;
    const inactiveWorkflow = Boolean(workflow && workflow.status !== "ACTIVE");
    const allowed = granted && !workflowMissing && !inactiveWorkflow;
    return {
      allowed, principalId, permission, roles: matchingRoles.map((role) => role.id),
      reason: workflowMissing ? "Workflow not found; access denied." :
        inactiveWorkflow ? "Workflow is not active; access denied." :
        allowed ? "A configured role grants this permission." : "No assigned role grants this permission; access denied.",
    };
  }

  private validId(value: unknown): value is string {
    return typeof value === "string" && value.length <= 128 && /^[a-zA-Z0-9._-]+$/.test(value);
  }

  private validLabel(value: unknown, maxLength: number): value is string {
    return typeof value === "string" && Boolean(value.trim()) && value.length <= maxLength;
  }
}
