import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createAppServer } from "./server.js";
import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import { PostgresCommercialTariffAdminStore } from "../../packages/pricing/postgres-commercial-tariff-admin-store.js";
import { PostgresAdminConfigurationStore } from "../../packages/workflows/postgres-admin-configuration-store.js";
import { PostgresWorkflowRoleDefinitionStore } from "../../packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../../packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { WorkflowDefinitionPublisher } from "../../packages/workflows/workflow-definition-publisher.js";
import { PostgresWorkflowExecutionService } from "../../packages/workflows/postgres-workflow-execution-service.js";
import { PostgresModuleEntitlementService } from "../../packages/workflows/postgres-module-entitlement-service.js";
import { appendAuditEvent, appendAuditEventInTransaction, assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { PostgresTicketStore, createCanonicalTicketAuditWriter } from "../../packages/ticketing/postgres-ticket-store.js";
import { PostgresAgentDraftStore } from "../../packages/agents/postgres-agent-draft-store.js";
import { PostgresCampaignSchedulerStore } from "../../packages/campaign-scheduler/postgres-campaign-scheduler-store.js";
import { PostgresActorApplicationAssignmentStore } from "../../packages/identity/postgres-actor-application-assignment-store.js";
import { PostgresTenantApplicationAssignmentStore } from "../../packages/identity/postgres-tenant-application-assignment-store.js";
import { PostgresCustomerIdentitySessionStore } from "../../packages/identity/postgres-customer-identity-session-store.js";
import { ProviderNeutralOidcClient } from "../../packages/identity/provider-neutral-oidc-client.js";
import { createConfiguredHttpInvoiceAmountSource } from "../../packages/payments/http-invoice-amount-source.js";
import { createConfiguredHttpTransactionSnapshotSource } from "../../packages/payments/http-transaction-snapshot-source.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const postgresPaymentMode = process.env.EPER_PAYMENT_PERSISTENCE === "postgres";
const postgresCapabilityMode = process.env.EPER_CAPABILITY_PERSISTENCE === "postgres";
const workflowExecutionEnabled = process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED === "true";
const workflowOutboxAdminEnabled = process.env.EPER_WORKFLOW_OUTBOX_ADMIN_API_ENABLED === "true";
const commercialTariffAdminEnabled = process.env.EPER_COMMERCIAL_TARIFF_API_ENABLED === "true";
const customerIdentityPersistenceMode = process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE ?? "disabled";
if (customerIdentityPersistenceMode !== "disabled" && customerIdentityPersistenceMode !== "postgres") {
  throw new Error("EPER_CUSTOMER_IDENTITY_PERSISTENCE_UNSUPPORTED");
}
const postgresDatabaseMode = postgresPaymentMode || postgresCapabilityMode || workflowExecutionEnabled || workflowOutboxAdminEnabled || commercialTariffAdminEnabled || customerIdentityPersistenceMode === "postgres";
const paymentPool = postgresDatabaseMode ? createPostgresPaymentPool() : null;
const paymentStore = postgresPaymentMode && paymentPool ? new PostgresPaymentStore(paymentPool) : undefined;
if (commercialTariffAdminEnabled && (!paymentPool || process.env.EPER_AUDIT_PERSISTENCE !== "postgres" ||
    process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" || process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres")) {
  throw new Error("COMMERCIAL_TARIFF_ADMIN_REQUIRES_POSTGRES_ADMIN_CONFIG_AND_DURABLE_AUDIT");
}
const commercialTariffAdminStore = commercialTariffAdminEnabled && paymentPool
  ? new PostgresCommercialTariffAdminStore(paymentPool as unknown as Pool)
  : undefined;
if (commercialTariffAdminStore) await commercialTariffAdminStore.assertReady();

const adminConfigMode = process.env.EPER_ADMIN_CONFIG_PERSISTENCE ?? "memory";
if (adminConfigMode !== "memory" && adminConfigMode !== "postgres") {
  throw new Error("EPER_ADMIN_CONFIG_PERSISTENCE_UNSUPPORTED");
}
if (adminConfigMode === "postgres" && (!paymentPool || process.env.EPER_AUDIT_PERSISTENCE !== "postgres")) {
  throw new Error("EPER_ADMIN_CONFIG_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
const adminConfigurationStore = adminConfigMode === "postgres" && paymentPool
  ? new PostgresAdminConfigurationStore(paymentPool)
  : undefined;

const moduleEntitlementMode = process.env.EPER_MODULE_ENTITLEMENT_PERSISTENCE ?? "disabled";
if (moduleEntitlementMode !== "disabled" && moduleEntitlementMode !== "postgres") {
  throw new Error("EPER_MODULE_ENTITLEMENT_PERSISTENCE_UNSUPPORTED");
}
if (moduleEntitlementMode === "postgres" && (!paymentPool || process.env.EPER_AUDIT_PERSISTENCE !== "postgres")) {
  throw new Error("EPER_MODULE_ENTITLEMENT_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
function readApplicationAssignments(): Record<string, string[]> {
  let value: unknown;
  try { value = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); }
  catch { throw new Error("EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON_INVALID"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON_REQUIRED");
  }
  const assignments: Record<string, string[]> = {};
  for (const [tenantId, applicationIds] of Object.entries(value as Record<string, unknown>)) {
    if (!tenantId.trim() || tenantId.length > 128 || !Array.isArray(applicationIds) ||
        applicationIds.some((applicationId) => typeof applicationId !== "string" || !applicationId.trim() || applicationId.length > 128)) {
      throw new Error("EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON_INVALID");
    }
    assignments[tenantId] = [...new Set(applicationIds as string[])];
  }
  return assignments;
}
let tenantApplicationAssignmentStoreForEntitlements: PostgresTenantApplicationAssignmentStore | undefined;
const moduleEntitlementService = moduleEntitlementMode === "postgres" && paymentPool
  ? new PostgresModuleEntitlementService(paymentPool, {
      async isAssignedToTenant(tenantId, applicationId) {
        if (process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE === "postgres") {
          if (!tenantApplicationAssignmentStoreForEntitlements) throw new Error("TENANT_APPLICATION_ASSIGNMENT_STORE_NOT_READY");
          return (await tenantApplicationAssignmentStoreForEntitlements.listActive(tenantId)).includes(applicationId);
        }
        const assignments = readApplicationAssignments();
        return assignments[tenantId]?.includes(applicationId) === true;
      },
    })
  : undefined;
if (moduleEntitlementMode === "postgres" && moduleEntitlementService) {
  await moduleEntitlementService.assertReady();
}
// Receipt numbering is an explicit operator/business configuration. Never silently
// choose a receipt-numbering policy; capture routes fail closed when the prefix is absent.
const receiptPrefix = process.env.EPER_PAYMENT_RECEIPT_NUMBER_PREFIX?.trim();
const receiptNumberSource = receiptPrefix && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,19}$/.test(receiptPrefix)
  ? async () => `${receiptPrefix}-${new Date().getUTCFullYear()}-${randomUUID().toUpperCase()}`
  : undefined;
const invoiceAmountSource = createConfiguredHttpInvoiceAmountSource();
const transactionSnapshotSource = createConfiguredHttpTransactionSnapshotSource();
const auditMode = process.env.EPER_AUDIT_PERSISTENCE ?? "disabled";
if (process.env.NODE_ENV === "production" && process.env.EPER_AGENTS_API_ENABLED === "true" && auditMode !== "postgres") {
  throw new Error("PRODUCTION_AGENT_API_REQUIRES_DURABLE_AUDIT");
}
if (auditMode !== "disabled" && auditMode !== "postgres") {
  throw new Error("EPER_AUDIT_PERSISTENCE_UNSUPPORTED");
}
if (auditMode === "postgres" && !paymentPool) {
  throw new Error("EPER_AUDIT_REQUIRES_POSTGRES_PAYMENT_PERSISTENCE");
}
if (customerIdentityPersistenceMode === "postgres" && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("CUSTOMER_IDENTITY_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
const auditEnvironment = process.env.EPER_AUDIT_ENVIRONMENT ?? "uat";
if (!["production", "uat", "sandbox"].includes(auditEnvironment)) {
  throw new Error("EPER_AUDIT_ENVIRONMENT_INVALID");
}
const actorAssignmentMode = process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE ?? "environment";
if (actorAssignmentMode !== "environment" && actorAssignmentMode !== "postgres") {
  throw new Error("EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE_UNSUPPORTED");
}
if (actorAssignmentMode === "postgres" && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("CUSTOMER_ACTOR_ASSIGNMENTS_REQUIRE_POSTGRES_AND_DURABLE_AUDIT");
}
if (customerIdentityPersistenceMode === "postgres" && actorAssignmentMode !== "postgres") {
  throw new Error("CUSTOMER_IDENTITY_REQUIRES_DURABLE_TENANT_AND_ACTOR_APPLICATION_ASSIGNMENTS");
}
if (workflowExecutionEnabled && (!paymentPool || auditMode !== "postgres" ||
    actorAssignmentMode !== "postgres" || adminConfigMode !== "postgres")) {
  throw new Error("WORKFLOW_EXECUTION_REQUIRES_POSTGRES_AUDIT_AND_DURABLE_ADMIN_ASSIGNMENTS");
}
if (workflowOutboxAdminEnabled && (!paymentPool || auditMode !== "postgres" ||
    actorAssignmentMode !== "postgres" || adminConfigMode !== "postgres" ||
    process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true")) {
  throw new Error("WORKFLOW_OUTBOX_ADMIN_REQUIRES_POSTGRES_AUDIT_AND_DURABLE_ADMIN_ASSIGNMENTS");
}
const actorApplicationAssignmentStore = actorAssignmentMode === "postgres" && paymentPool
  ? new PostgresActorApplicationAssignmentStore(paymentPool)
  : undefined;
if (actorApplicationAssignmentStore) await actorApplicationAssignmentStore.assertReady();
const tenantApplicationAssignmentStore = actorAssignmentMode === "postgres" && paymentPool
  ? new PostgresTenantApplicationAssignmentStore(paymentPool)
  : undefined;
if (tenantApplicationAssignmentStore) await tenantApplicationAssignmentStore.assertReady();
tenantApplicationAssignmentStoreForEntitlements = tenantApplicationAssignmentStore;
const customerIdentitySessionStore = customerIdentityPersistenceMode === "postgres" && paymentPool
  ? new PostgresCustomerIdentitySessionStore(paymentPool)
  : undefined;
if (customerIdentitySessionStore) await customerIdentitySessionStore.assertReady();

const customerOidcEnabled = process.env.EPER_CUSTOMER_OIDC_ENABLED === "true";
let customerOidcClient: ProviderNeutralOidcClient | undefined;
let customerOidcPublicOrigin: string | undefined;
let customerCsrfSecret: string | undefined;
if (customerOidcEnabled) {
  if (customerIdentityPersistenceMode !== "postgres" || !customerIdentitySessionStore ||
      actorAssignmentMode !== "postgres" || !tenantApplicationAssignmentStore || auditMode !== "postgres") {
    throw new Error("CUSTOMER_OIDC_REQUIRES_POSTGRES_IDENTITY_ASSIGNMENTS_AND_DURABLE_AUDIT");
  }
  const issuer = process.env.EPER_CUSTOMER_OIDC_ISSUER?.trim();
  const clientId = process.env.EPER_CUSTOMER_OIDC_CLIENT_ID?.trim();
  const redirectUri = process.env.EPER_CUSTOMER_OIDC_REDIRECT_URI?.trim();
  const pkceEncryptionKey = process.env.EPER_CUSTOMER_OIDC_PKCE_ENCRYPTION_KEY;
  customerOidcPublicOrigin = process.env.EPER_CUSTOMER_OIDC_PUBLIC_ORIGIN?.trim();
  customerCsrfSecret = process.env.EPER_CUSTOMER_CSRF_SECRET;
  if (!issuer || !clientId || !redirectUri || !pkceEncryptionKey || pkceEncryptionKey.length < 32 ||
      !customerOidcPublicOrigin || !customerCsrfSecret || customerCsrfSecret.length < 32) {
    throw new Error("CUSTOMER_OIDC_CONFIGURATION_INCOMPLETE");
  }
  let publicOrigin: URL;
  try { publicOrigin = new URL(customerOidcPublicOrigin); } catch { throw new Error("CUSTOMER_OIDC_PUBLIC_ORIGIN_INVALID"); }
  const localHttp = publicOrigin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(publicOrigin.hostname);
  if ((publicOrigin.protocol !== "https:" && !localHttp) || publicOrigin.origin !== customerOidcPublicOrigin ||
      publicOrigin.username || publicOrigin.password || publicOrigin.hash) {
    throw new Error("CUSTOMER_OIDC_PUBLIC_ORIGIN_INVALID");
  }
  let callbackUrl: URL;
  try { callbackUrl = new URL(redirectUri); } catch { throw new Error("CUSTOMER_OIDC_REDIRECT_URI_INVALID"); }
  if (callbackUrl.origin !== publicOrigin.origin || callbackUrl.pathname !== "/customer/auth/oidc/callback" ||
      callbackUrl.search || callbackUrl.hash || callbackUrl.username || callbackUrl.password) {
    throw new Error("CUSTOMER_OIDC_REDIRECT_URI_INVALID");
  }
  if (process.env.NODE_ENV === "production" && !customerOidcPublicOrigin.startsWith("https://")) {
    throw new Error("PRODUCTION_CUSTOMER_OIDC_REQUIRES_HTTPS_PUBLIC_ORIGIN");
  }
  customerOidcClient = new ProviderNeutralOidcClient({
    issuer, clientId, redirectUri, pkceEncryptionKey,
    clientSecret: process.env.EPER_CUSTOMER_OIDC_CLIENT_SECRET || undefined,
  });
}

const workflowAuthorizationStoresEnabled = workflowExecutionEnabled || workflowOutboxAdminEnabled;
const workflowRoleDefinitionStore = workflowAuthorizationStoresEnabled && paymentPool
  ? new PostgresWorkflowRoleDefinitionStore(paymentPool)
  : undefined;
const workflowActorRoleAssignmentStore = workflowAuthorizationStoresEnabled && paymentPool
  ? new PostgresWorkflowActorRoleAssignmentStore(paymentPool)
  : undefined;
const workflowDefinitionPublisher = workflowExecutionEnabled && paymentPool
  ? new WorkflowDefinitionPublisher(paymentPool)
  : undefined;
const workflowExecutionService = workflowExecutionEnabled && paymentPool
  ? new PostgresWorkflowExecutionService(paymentPool, process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID)
  : undefined;
if (workflowRoleDefinitionStore) await workflowRoleDefinitionStore.assertReady();
if (workflowActorRoleAssignmentStore) await workflowActorRoleAssignmentStore.assertReady();
if (workflowExecutionService) await workflowExecutionService.assertReady();

const auditWriter = auditMode === "postgres" && paymentPool
  ? async (record: import("../../packages/agents/agent-workflows.js").AgentAuditRecord): Promise<void> => {
      await appendAuditEvent(paymentPool, {
        tenantId: record.tenantId,
        applicationId: record.applicationId ?? "eper",
        environment: auditEnvironment as "production" | "uat" | "sandbox",
        actorType: record.actorId === "anonymous" ? "system" : "human",
        actorId: record.actorId,
        action: record.action,
        outcome: record.outcome,
        reasonCode: record.outcome === "denied" ? "request_denied" : undefined,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        requestId: record.requestId,
        source: "api",
        operationName: record.operationName,
        serviceVersion: process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
        payload: record.payload,
      });
    }
  : undefined;
if (auditMode === "postgres" && paymentPool) {
  await assertAuditStoreReady(paymentPool);
}

const agentsEnabled = process.env.EPER_AGENTS_API_ENABLED === "true";
if (agentsEnabled && (!paymentPool || adminConfigMode !== "postgres" || auditMode !== "postgres")) {
  throw new Error("AGENTS_API_REQUIRES_POSTGRES_CONFIGURATION_AND_DURABLE_AUDIT");
}
const agentDraftStore = agentsEnabled && paymentPool ? new PostgresAgentDraftStore(paymentPool, auditEnvironment as "production" | "uat" | "sandbox", process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID) : undefined;
if (agentDraftStore) await agentDraftStore.assertReady();

const campaignSchedulerEnabled = process.env.EPER_CAMPAIGN_SCHEDULER_API_ENABLED === "true";
if (campaignSchedulerEnabled && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("CAMPAIGN_SCHEDULER_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
const campaignSchedulerStore = campaignSchedulerEnabled && paymentPool
  ? new PostgresCampaignSchedulerStore(paymentPool, auditEnvironment as "production" | "uat" | "sandbox", process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID)
  : undefined;
if (campaignSchedulerStore) await campaignSchedulerStore.assertReady();

const ticketingEnabled = process.env.EPER_TICKETING_API_ENABLED === "true";
if (ticketingEnabled && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("TICKETING_API_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
const ticketStore = ticketingEnabled && paymentPool
  ? new PostgresTicketStore(
      paymentPool,
      createCanonicalTicketAuditWriter(
        auditEnvironment as "production" | "uat" | "sandbox",
        process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
      ),
    )
  : undefined;
if (ticketStore) await ticketStore.assertReady();

if (adminConfigMode === "postgres" && adminConfigurationStore) {
  await adminConfigurationStore.assertReady();
}

const server = createAppServer({
  capabilityPool: (postgresCapabilityMode || workflowOutboxAdminEnabled) ? paymentPool as unknown as Pool : undefined,
  paymentStore, invoiceAmountSource, receiptNumberSource, transactionSnapshotSource, auditWriter,
  agentDraftStore, ticketStore, actorApplicationAssignmentStore, tenantApplicationAssignmentStore, customerIdentitySessionStore,
  customerOidcClient, customerOidcPublicOrigin, customerCsrfSecret, adminConfigurationStore, commercialTariffAdminStore, moduleEntitlementService, campaignSchedulerStore,
  adminConfigEnvironment: auditEnvironment as "production" | "uat" | "sandbox",
  serviceVersion: process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
  workflowRoleDefinitionStore, workflowActorRoleAssignmentStore,
  workflowDefinitionPublisher, workflowExecutionService,
});

server.listen(port, host, () => {
  console.log(`EPER API listening on ${host}:${port}`);
});

async function shutdown(signal: string): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
    if (paymentPool) await paymentPool.end();
  } catch (error) {
    console.error(`EPER API shutdown failed after ${signal}`, error);
    process.exitCode = 1;
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void shutdown(signal); });
}
