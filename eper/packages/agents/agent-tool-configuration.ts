/**
 * Tenant/application-scoped agent tool configuration contract.
 *
 * This is the canonical schema for the upcoming server-side configuration
 * endpoint. It deliberately contains no credentials. Runtime enforcement and
 * durable persistence must be added before these settings are treated as active.
 */
export type AgentEnvironment = "production" | "uat" | "sandbox";
export type AgentToolConfiguration = {
  schemaVersion: 1;
  tenantId: string;
  applicationId: string;
  environment: AgentEnvironment;
  version: number;
  updatedBy: string;
  updatedAt: string;
  tools: {
    alerts: { enabled: boolean; channel: "in-app" | "email-draft" | "webhook-proposal"; leadScoreThreshold: number };
    posts: { enabled: boolean; channels: Array<"linkedin" | "instagram" | "facebook" | "website">; approvalRequired: true };
    reports: { enabled: boolean; types: Array<"lead-pipeline" | "source-conversion" | "lead-aging" | "campaign-performance">; cadence: "on-demand" | "daily" | "weekly" | "monthly" };
    leadMaterialization: { enabled: boolean; target: "native-crm" | "csv-review" | "external-crm-proposal"; dedupeRequired: true; consentCheckRequired: true; approvalRequired: true };
  };
  ai: { provider: "template-only" | "openai" | "azure-openai" | "custom"; redactUnnecessaryPii: true; auditRequired: true; retentionDays: 0 | 30 | 90 };
  access: { allowedRoles: string[]; externalActionsEnabled: false };
};

export const DEFAULT_AGENT_TOOL_CONFIGURATION: Omit<AgentToolConfiguration, "tenantId" | "applicationId" | "environment" | "version" | "updatedBy" | "updatedAt"> = {
  schemaVersion: 1,
  tools: {
    alerts: { enabled: false, channel: "in-app", leadScoreThreshold: 80 },
    posts: { enabled: true, channels: ["website"], approvalRequired: true },
    reports: { enabled: true, types: ["lead-pipeline", "source-conversion", "lead-aging"], cadence: "on-demand" },
    leadMaterialization: { enabled: false, target: "native-crm", dedupeRequired: true, consentCheckRequired: true, approvalRequired: true },
  },
  ai: { provider: "template-only", redactUnnecessaryPii: true, auditRequired: true, retentionDays: 0 },
  access: { allowedRoles: [], externalActionsEnabled: false },
};

/** Prevent cross-tenant or cross-application config lookup collisions. */
export function agentToolConfigurationKey(tenantId: string, applicationId: string, environment: AgentEnvironment): string {
  return [tenantId, applicationId, environment].map((part) => part.trim()).join(":");
}
