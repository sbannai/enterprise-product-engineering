export type WorkflowPermission =
  | "workflow:view"
  | "workflow:act"
  | "workflow:approve"
  | "workflow:admin"
  | "role:assign"
  | "access:manage";

export type WorkflowFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox";
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
export interface WorkflowActivity {
  id: string;
  title: string;
  type: "TASK" | "FORM" | "APPROVAL";
  roleId: string;
  permission: "workflow:act" | "workflow:approve";
  nextActivityIds: string[];
  fields: WorkflowField[];
}
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  status: "DRAFT" | "ACTIVE";
  activities: WorkflowActivity[];
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
            !Array.isArray(activity.fields)) {
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
