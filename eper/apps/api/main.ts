import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createAppServer } from "./server.js";
import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import { PostgresAdminConfigurationStore } from "../../packages/workflows/postgres-admin-configuration-store.js";
import { PostgresModuleEntitlementService } from "../../packages/workflows/postgres-module-entitlement-service.js";
import { appendAuditEvent, appendAuditEventInTransaction, assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { PostgresTicketStore, createCanonicalTicketAuditWriter } from "../../packages/ticketing/postgres-ticket-store.js";
import { PostgresAgentDraftStore } from "../../packages/agents/postgres-agent-draft-store.js";
import { PostgresAgentStore } from "../../packages/agents/postgres-agent-store.js";
import { processAgentJobOnce } from "../../packages/agents/agent-worker.js";
import { PostgresCampaignSchedulerStore } from "../../packages/campaign-scheduler/postgres-campaign-scheduler-store.js";
import { createConfiguredHttpInvoiceAmountSource } from "../../packages/payments/http-invoice-amount-source.js";
import { createConfiguredHttpTransactionSnapshotSource } from "../../packages/payments/http-transaction-snapshot-source.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const postgresPaymentMode = process.env.EPER_PAYMENT_PERSISTENCE === "postgres";
const postgresCapabilityMode = process.env.EPER_CAPABILITY_PERSISTENCE === "postgres";
const postgresDatabaseMode = postgresPaymentMode || postgresCapabilityMode;
const paymentPool = postgresDatabaseMode ? createPostgresPaymentPool() : null;
const paymentStore = postgresPaymentMode && paymentPool ? new PostgresPaymentStore(paymentPool) : undefined;
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
const moduleEntitlementService = moduleEntitlementMode === "postgres" && paymentPool
  ? new PostgresModuleEntitlementService(paymentPool, {
      async isAssignedToTenant(tenantId, applicationId) {
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
const auditEnvironment = process.env.EPER_AUDIT_ENVIRONMENT ?? "uat";
if (!["production", "uat", "sandbox"].includes(auditEnvironment)) {
  throw new Error("EPER_AUDIT_ENVIRONMENT_INVALID");
}
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

// The worker is opt-in and stays disabled by default. Its scope comes exclusively
// from the operator-managed tenant/application assignment map, never request data.
const agentWorkerEnabled = process.env.EPER_AGENT_JOB_WORKER_ENABLED === "true";
if (agentWorkerEnabled && (!agentsEnabled || !paymentPool || adminConfigMode !== "postgres" || auditMode !== "postgres")) {
  throw new Error("AGENT_WORKER_REQUIRES_ENABLED_AGENT_API_POSTGRES_AND_DURABLE_AUDIT");
}
const agentWorkerStore = agentWorkerEnabled && paymentPool ? new PostgresAgentStore(paymentPool) : undefined;
if (agentWorkerStore) await agentWorkerStore.assertReady();
const agentWorkerAssignments = agentWorkerEnabled ? readApplicationAssignments() : {};
const agentWorkerTargets = Object.entries(agentWorkerAssignments).flatMap(([tenantId, applicationIds]) =>
  applicationIds.map((applicationId) => ({ tenantId, applicationId })),
);
if (agentWorkerEnabled && agentWorkerTargets.length === 0) {
  throw new Error("AGENT_WORKER_APPLICATION_ASSIGNMENTS_REQUIRED");
}
const agentWorkerPollMs = Number.parseInt(process.env.EPER_AGENT_WORKER_POLL_MS ?? "1000", 10);
if (agentWorkerEnabled && (!Number.isInteger(agentWorkerPollMs) || agentWorkerPollMs < 250 || agentWorkerPollMs > 5000)) {
  throw new Error("AGENT_WORKER_POLL_INTERVAL_INVALID");
}
const agentWorkerId = (process.env.EPER_AGENT_WORKER_ID ?? `eper-api-${process.pid}`).trim();
if (agentWorkerEnabled && (!agentWorkerId || agentWorkerId.length > 128)) {
  throw new Error("AGENT_WORKER_ID_INVALID");
}
let agentWorkerRunning = true;
let agentWorkerPromise: Promise<void> | undefined;
if (agentWorkerEnabled && agentWorkerStore) {
  agentWorkerPromise = (async () => {
    while (agentWorkerRunning) {
      let processed = false;
      for (const target of agentWorkerTargets) {
        if (!agentWorkerRunning) break;
        try {
          const result = await processAgentJobOnce({
            store: agentWorkerStore,
            tenantId: target.tenantId,
            applicationId: target.applicationId,
            workerId: agentWorkerId,
            environment: auditEnvironment as "production" | "uat" | "sandbox",
          });
          if (result.outcome !== "idle") {
            processed = true;
            console.log("EPER agent worker outcome", { outcome: result.outcome, jobId: result.jobId });
          }
        } catch (error) {
          const code = error instanceof Error && /^[A-Z0-9_:-]{2,80}$/.test(error.message)
            ? error.message : "AGENT_WORKER_POLL_FAILED";
          console.error("EPER agent worker iteration failed", { code });
        }
      }
      if (agentWorkerRunning && !processed) {
        await new Promise<void>((resolve) => setTimeout(resolve, agentWorkerPollMs));
      }
    }
  })();
}

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
  capabilityPool: postgresCapabilityMode ? paymentPool as unknown as Pool : undefined,
  paymentStore, invoiceAmountSource, receiptNumberSource, transactionSnapshotSource, auditWriter,
  agentDraftStore, ticketStore, adminConfigurationStore, moduleEntitlementService, campaignSchedulerStore,
  adminConfigEnvironment: auditEnvironment as "production" | "uat" | "sandbox",
  serviceVersion: process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
});

server.listen(port, host, () => {
  console.log(`EPER API listening on ${host}:${port}`);
});

async function shutdown(signal: string): Promise<void> {
  try {
    agentWorkerRunning = false;
    if (agentWorkerPromise) await agentWorkerPromise;
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
