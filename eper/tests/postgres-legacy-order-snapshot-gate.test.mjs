import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createAppServer } from "../dist/apps/api/server.js";

test("PostgreSQL legacy order without an immutable snapshot fails closed on webhook and verify", async () => {
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const keySecret = "legacy-order-test-secret";
  const webhookSecret = "legacy-order-webhook-secret";
  const token = "legacy-order-token-".padEnd(40, "x");
  const tenantId = "tenant-legacy-test";
  const orderId = "order_legacy_snapshot_missing";
  const paymentId = "pay_legacy_snapshot_missing";
  let captureWebhookCalls = 0;
  let captureVerifiedCalls = 0;
  let snapshotSourceCalls = 0;

  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: keySecret,
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    EPER_PAYMENT_API_TOKEN: "shared-api-token-unused-for-tenant-scope".padEnd(40, "z"),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ [tenantId]: token }),
    EPER_PAYMENT_LEDGER_FILE: "/tmp/unused-legacy-order-ledger.json",
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/payments/" + paymentId) {
      return new Response(JSON.stringify({
        id: paymentId, order_id: orderId, amount: 12500, currency: "INR", status: "captured",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return nativeFetch(input, init);
  };

  const legacyOrder = {
    id: "legacy-41",
    transactionPublicId: "legacy-transaction-public-id",
    tenantId,
    invoiceReference: "legacy-invoice-reference",
    providerOrderId: orderId,
    providerPaymentId: null,
    amountMinor: 12500,
    currency: "INR",
    status: "created",
    transactionSnapshot: null,
  };
  const paymentStore = {
    async findOrderByProviderOrderId(id) { return id === orderId ? { ...legacyOrder } : null; },
    async findOrder(requestTenant, id) {
      return requestTenant === tenantId && id === orderId ? { ...legacyOrder } : null;
    },
    async capturePayment() { captureWebhookCalls += 1; return { ok: true, value: {} }; },
    async captureVerifiedPayment() { captureVerifiedCalls += 1; return { ok: true, value: {} }; },
  };
  const server = createAppServer({
    paymentStore,
    transactionSnapshotSource: {
      async findTransaction() { snapshotSourceCalls += 1; return null; },
    },
    invoiceAmountSource: {
      async findInvoice() {
        return {
          tenantId, reference: "legacy-invoice-reference", amountDuePaise: 12500,
          currency: "INR", status: "DUE", sourceId: "test-source",
          sourceVersion: "v1", approvedAt: "2026-10-20T12:00:00.000Z",
        };
      },
    },
    receiptNumberSource: async () => "EPER-LEGACY-0001",
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const event = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: paymentId, order_id: orderId, amount: 12500, currency: "INR", status: "captured",
      } } },
    });
    const webhookSignature = createHmac("sha256", webhookSecret).update(event).digest("hex");
    const webhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": webhookSignature,
        "x-razorpay-event-id": "evt_legacy_snapshot_missing",
      },
      body: event,
    });
    assert.equal(webhook.status, 503);
    assert.equal((await webhook.json()).error, "trusted_transaction_snapshot_unavailable");
    assert.equal(captureWebhookCalls, 0, "legacy webhook must not persist capture or issue a receipt without a frozen snapshot");

    const paymentSignature = createHmac("sha256", keySecret).update(orderId + "|" + paymentId).digest("hex");
    const verify = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: paymentSignature,
      }),
    });
    assert.equal(verify.status, 503);
    assert.equal((await verify.json()).error, "trusted_transaction_snapshot_unavailable");
    assert.equal(captureVerifiedCalls, 0, "legacy verification must not persist capture or issue a receipt without a frozen snapshot");
    assert.equal(snapshotSourceCalls, 0, "must not replace the missing order-time snapshot with a mutable current source");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});
