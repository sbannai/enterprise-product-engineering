import { randomUUID } from "node:crypto";
import { createAppServer } from "./server.js";
import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import { PostgresAdminConfigurationStore } from "../../packages/workflows/postgres-admin-configuration-store.js";
import { appendAuditEvent, assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { createConfiguredHttpInvoiceAmountSource } from "../../packages/payments/http-invoice-amount-source.js";
import { createConfiguredHttpTransactionSnapshotSource } from "../../packages/payments/http-transaction-snapshot-source.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const postgresPaymentMode = process.env.EPER_PAYMENT_PERSISTENCE === "postgres";
const paymentPool = postgresPaymentMode ? createPostgresPaymentPool() : null;
const paymentStore = paymentPool ? new PostgresPaymentStore(paymentPool) : undefined;
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
        applicationId: "eper",
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

const server = createAppServer({ paymentStore, invoiceAmountSource, receiptNumberSource, transactionSnapshotSource, auditWriter, adminConfigurationStore, adminConfigEnvironment: auditEnvironment as "production" | "uat" | "sandbox", serviceVersion: process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID });

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
