import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createAppServer } from "../dist/apps/api/server.js";

test("PostgreSQL route exposes stable transaction UUID and downloads persisted receipt by its own UUID", async () => {
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "route-test-token-".padEnd(40, "x");
  const transactionPublicId = "7d4f9b22-a34e-4d12-8c63-30f6a2e4f12a";
  const receiptPublicId = "9e3b1a60-2f44-4b4e-8a18-7f8e61a5d932";
  const tenantId = "tenant-route-test";
  const providerOrderId = "order_route_test";
  const providerPaymentId = "pay_route_test";
  const receiptNumber = "EPER-TEST-0001";
  let captured = false;
  let persistedPdf = null;
  let order = {
    id: "41", transactionPublicId, tenantId, invoiceReference: "invoice-route-test",
    providerOrderId, providerPaymentId: null, amountMinor: 12500, currency: "INR",
    status: "created", createdAt: "2026-10-21T00:00:00.000Z",
  };
  let receipt = {
    receiptPublicId, orderId: "41", receiptNumber, documentSha256: null,
    documentPdf: null, issuedAt: "2026-10-21T00:00:01.000Z",
  };
  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "route-secret",
    RAZORPAY_WEBHOOK_SECRET: "route-webhook-secret",
    EPER_PAYMENT_API_TOKEN: token,
    EPER_PAYMENT_LEDGER_FILE: "/tmp/unused-eper-payment-ledger.json",
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      return new Response(JSON.stringify({ id: providerOrderId }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.razorpay.com/v1/payments/" + providerPaymentId) {
      return new Response(JSON.stringify({
        id: providerPaymentId, order_id: providerOrderId, amount: 12500, currency: "INR", status: "captured",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return nativeFetch(input, init);
  };

  const paymentStore = {
    async reserveOrder() {
      return { ok: true, value: { id: "41", transactionPublicId, providerOrderId: null } };
    },
    async completeOrderCreation() {
      return { ok: true, value: { id: "41", transactionPublicId, providerOrderId } };
    },
    async findOrderByProviderOrderId(id) { return id === providerOrderId ? { ...order } : null; },
    async capturePayment(input) {
      assert.equal(input.providerEventId, "evt_route_test_001");
      assert.equal(input.tenantId, tenantId);
      assert.equal(input.receiptNumber, receiptNumber);
      captured = true;
      order = { ...order, status: "captured", providerPaymentId };
      return { ok: true, value: { receiptPublicId, receiptNumber } };
    },
    async findOrder(requestTenant, id) {
      return requestTenant === tenantId && id === providerOrderId ? { ...order } : null;
    },
    async captureVerifiedPayment(input) {
      assert.equal(input.tenantId, tenantId);
      assert.equal(input.providerOrderId, providerOrderId);
      assert.equal(input.providerPaymentId, providerPaymentId);
      assert.equal(input.receiptNumber, receiptNumber);
      return { ok: true, value: { receiptPublicId, receiptNumber, transactionPublicId } };
    },
    async findReceiptByPublicId(requestTenant, id) {
      return requestTenant === tenantId && id === receiptPublicId ? { ...receipt, documentPdf: persistedPdf } : null;
    },
    async findOrderByInternalId(requestTenant, id) {
      return requestTenant === tenantId && id === "41" ? { ...order } : null;
    },
    async persistReceiptDocument(requestTenant, id, pdf) {
      assert.equal(requestTenant, tenantId);
      assert.equal(id, "41");
      persistedPdf = Buffer.from(pdf);
      const documentSha256 = createHash("sha256").update(persistedPdf).digest("hex");
      receipt = { ...receipt, documentPdf: persistedPdf, documentSha256 };
      return { ok: true, value: { documentSha256 } };
    },
    async findReceipt(requestTenant, id) {
      return requestTenant === tenantId && id === "41" ? { ...receipt, documentPdf: persistedPdf } : null;
    },
  };

  const server = createAppServer({
    paymentStore,
    invoiceAmountSource: {
      async findInvoice({ tenantId: requestedTenant, reference }) {
        if (requestedTenant !== tenantId || reference !== "invoice-route-test") return null;
        return {
          tenantId, reference, amountDuePaise: 12500, currency: "INR", status: "DUE",
          sourceId: "approved-test-source", sourceVersion: "v1", approvedAt: "2026-10-20T12:00:00.000Z",
        };
      },
    },
    receiptNumberSource: async () => receiptNumber,
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = {
      authorization: `Bearer ${token}`, "x-tenant-id": tenantId, "content-type": "application/json",
    };

    const created = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers: { ...headers, "idempotency-key": "route-idem-001" },
      body: JSON.stringify({ tenantId, reference: "invoice-route-test" }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.payment.id, transactionPublicId);
    assert.match(createdBody.payment.id, /^[0-9a-f-]{36}$/i);
    assert.notEqual(createdBody.payment.id, receiptPublicId);

    const event = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: providerPaymentId, order_id: providerOrderId, amount: 12500, currency: "INR", status: "captured",
      } } },
    });
    const signature = createHmac("sha256", "route-webhook-secret").update(event).digest("hex");
    const webhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_route_test_001" },
      body: event,
    });
    assert.equal(webhook.status, 200);
    assert.equal(captured, true);
    const webhookBody = await webhook.json();
    assert.equal(webhookBody.receiptId, receiptPublicId);
    assert.equal(webhookBody.receiptNumber, receiptNumber);
    assert.equal(webhookBody.receiptUrl, `/api/payments/receipts/${receiptPublicId}.pdf`);

    const verificationSignature = createHmac("sha256", "route-secret")
      .update(providerOrderId + "|" + providerPaymentId).digest("hex");
    const verified = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(verified.status, 200);
    const verifiedBody = await verified.json();
    assert.equal(verifiedBody.payment.id, transactionPublicId);
    assert.equal(verifiedBody.payment.receiptId, receiptPublicId);
    assert.equal(verifiedBody.receiptUrl, `/api/payments/receipts/${receiptPublicId}.pdf`);

    const download = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-type") ?? "", /application\/pdf/);
    assert.match(download.headers.get("content-disposition") ?? "", new RegExp(receiptPublicId.replaceAll("-", "\\-") + "\\.pdf"));
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.ok(bytes.subarray(0, 5).toString("ascii") === "%PDF-");
    assert.ok(bytes.includes(Buffer.from(receiptPublicId)));
    assert.ok(bytes.includes(Buffer.from(transactionPublicId))); // Transaction and receipt IDs are both explicit and distinct in the document.
    const repeatedDownload = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(repeatedDownload.status, 200);
    assert.deepEqual(Buffer.from(await repeatedDownload.arrayBuffer()), bytes);

    // Persisted PDF bytes must match the stored digest before they are served.
    persistedPdf = Buffer.from(bytes);
    persistedPdf[persistedPdf.length - 10] ^= 0x01;
    const corruptedDownload = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(corruptedDownload.status, 503);
    assert.equal((await corruptedDownload.json()).error, "receipt_document_integrity_failed");

    const crossTenant = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "another-tenant" },
    });
    assert.equal(crossTenant.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});
