export const TICKET_TYPES = ["defect", "feedback", "feature_request", "question"] as const;
export type TicketType = typeof TICKET_TYPES[number];

export const TICKET_SEVERITIES = ["p1_candidate", "p2", "p3", "p4"] as const;
export type TicketSeverity = typeof TICKET_SEVERITIES[number];

export const TICKET_STATUSES = ["new", "triaged", "assigned", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

export interface TicketIdentity {
  tenantId: string;
  applicationId: string;
  actorId: string;
  correlationId: string;
}

export interface CreateTicketInput {
  type: TicketType;
  title: string;
  description: string;
  businessImpact: string;
  evidenceReference?: string;
}

export interface TicketRecord extends CreateTicketInput {
  id: string;
  tenantId: string;
  applicationId: string;
  createdBy: string;
  status: TicketStatus;
  severity: TicketSeverity;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TicketValidationResult =
  | { valid: true; value: CreateTicketInput }
  | { valid: false; errors: string[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const boundedText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

/** Validates untrusted customer input; tenant, actor, status and severity are server-derived. */
export function validateCreateTicketInput(value: unknown): TicketValidationResult {
  if (!isObject(value)) return { valid: false, errors: ["body_must_be_object"] };
  const errors: string[] = [];
  if (!(TICKET_TYPES as readonly unknown[]).includes(value.type)) errors.push("invalid_type");
  if (!boundedText(value.title, 160)) errors.push("title_required_or_too_long");
  if (!boundedText(value.description, 8000)) errors.push("description_required_or_too_long");
  if (!boundedText(value.businessImpact, 2000)) errors.push("business_impact_required_or_too_long");
  if (value.evidenceReference !== undefined &&
      (typeof value.evidenceReference !== "string" || value.evidenceReference.trim().length > 500)) {
    errors.push("invalid_evidence_reference");
  }
  // Never accept client-supplied identity, tenant, status, severity or assignment fields.
  for (const key of ["tenantId", "applicationId", "actorId", "createdBy", "status", "severity", "assignedTo"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) errors.push(`server_managed_field_forbidden:${key}`);
  }
  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    value: {
      type: value.type as TicketType,
      title: (value.title as string).trim(),
      description: (value.description as string).trim(),
      businessImpact: (value.businessImpact as string).trim(),
      ...(typeof value.evidenceReference === "string" && value.evidenceReference.trim()
        ? { evidenceReference: value.evidenceReference.trim() }
        : {}),
    },
  };
}
