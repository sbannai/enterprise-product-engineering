import { randomUUID } from "node:crypto";
import { createAppServer } from "./server.js";
import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
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
// Receipt numbering is an explicit operator/business configuration. Never silently
// choose a receipt-numbering policy; capture routes fail closed when the prefix is absent.
const receiptPrefix = process.env.EPER_PAYMENT_RECEIPT_NUMBER_PREFIX?.trim();
const receiptNumberSource = receiptPrefix && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,19}$/.test(receiptPrefix)
  ? async () => `${receiptPrefix}-${new Date().getUTCFullYear()}-${randomUUID().toUpperCase()}`
  : undefined;
const invoiceAmountSource = createConfiguredHttpInvoiceAmountSource();
const transactionSnapshotSource = createConfiguredHttpTransactionSnapshotSource();
const server = createAppServer({ paymentStore, invoiceAmountSource, receiptNumberSource, transactionSnapshotSource });

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
