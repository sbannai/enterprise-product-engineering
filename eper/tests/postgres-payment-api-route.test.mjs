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
  let receiptNumberSourceValue = receiptNumber;
  let captured = false;
  let webhookCaptureCalls = 0;
  let originalWebhookPayloadSha256 = null;
  let webhookGatewayAmount = 12500;
  let verifiedCaptureCalls = 0;
  let gatewayAmount = 12500;
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
        id: providerPaymentId, order_id: providerOrderId, amount: gatewayAmount, currency: "INR", status: "captured",
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
      // Model durable idempotency and payload-conflict behavior for provider event IDs.
      if (captured && input.providerEventId === "evt_route_test_001") {
        return { ok: false, reason: input.payloadSha256 === originalWebhookPayloadSha256 ? "duplicate_event" : "event_conflict" };
      }
      webhookCaptureCalls += 1;
      assert.equal(input.providerEventId, "evt_route_test_001");
      assert.equal(input.amountMinor, webhookGatewayAmount);
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
      verifiedCaptureCalls += 1;
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
    receiptNumberSource: async () => receiptNumberSourceValue,
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
        id: providerPaymentId, order_id: providerOrderId, amount: gatewayAmount, currency: "INR", status: "captured",
      } } },
    });
    const signature = createHmac("sha256", "route-webhook-secret").update(event).digest("hex");
    originalWebhookPayloadSha256 = createHash("sha256").update(event).digest("hex");
    const mismatchedEvent = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: providerPaymentId, order_id: providerOrderId, amount: 12000, currency: "INR", status: "captured",
      } } },
    });
    const mismatchedSignature = createHmac("sha256", "route-webhook-secret").update(mismatchedEvent).digest("hex");
    const mismatchedWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": mismatchedSignature, "x-razorpay-event-id": "evt_route_test_mismatch" },
      body: mismatchedEvent,
    });
    assert.equal(mismatchedWebhook.status, 409);
    assert.equal((await mismatchedWebhook.json()).error, "gateway_payment_details_mismatch");
    assert.equal(webhookCaptureCalls, 0, "mismatched webhook amount must not reach capture persistence");

    // A valid signature must not make an otherwise invalid currency or payment state acceptable.
    for (const [eventId, overrides] of [
      ["evt_route_test_currency", { currency: "USD" }],
      ["evt_route_test_status", { status: "authorized" }],
    ]) {
      const invalidEvent = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: {
          id: providerPaymentId, order_id: providerOrderId, amount: 12500, currency: "INR", status: "captured",
          ...overrides,
        } } },
      });
      const invalidSignature = createHmac("sha256", "route-webhook-secret").update(invalidEvent).digest("hex");
      const invalidWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-razorpay-signature": invalidSignature, "x-razorpay-event-id": eventId },
        body: invalidEvent,
      });
      assert.equal(invalidWebhook.status, 400);
      assert.equal((await invalidWebhook.json()).error, "captured_payment_event_invalid");
      assert.equal(webhookCaptureCalls, 0, "invalid currency/status must not reach capture persistence");
    }

    const stringAmountEvent = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: providerPaymentId, order_id: providerOrderId, amount: "12500", currency: "INR", status: "captured",
      } } },
    });
    const stringAmountSignature = createHmac("sha256", "route-webhook-secret").update(stringAmountEvent).digest("hex");
    const stringAmountWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": stringAmountSignature, "x-razorpay-event-id": "evt_route_test_string_amount" },
      body: stringAmountEvent,
    });
    assert.equal(stringAmountWebhook.status, 400);
    assert.equal((await stringAmountWebhook.json()).error, "captured_payment_event_invalid");
    assert.equal(webhookCaptureCalls, 0, "string-valued amount must not reach capture persistence");

    for (const [eventId, amount] of [["evt_route_test_fractional_amount", 12500.5], ["evt_route_test_zero_amount", 0]]) {
      const invalidAmountEvent = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: {
          id: providerPaymentId, order_id: providerOrderId, amount, currency: "INR", status: "captured",
        } } },
      });
      const invalidAmountSignature = createHmac("sha256", "route-webhook-secret").update(invalidAmountEvent).digest("hex");
      const invalidAmountWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-razorpay-signature": invalidAmountSignature, "x-razorpay-event-id": eventId },
        body: invalidAmountEvent,
      });
      assert.equal(invalidAmountWebhook.status, 400);
      assert.equal((await invalidAmountWebhook.json()).error, "captured_payment_event_invalid");
      assert.equal(webhookCaptureCalls, 0, "fractional/zero amount must not reach capture persistence");
    }

    const missingOrderEvent = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: providerPaymentId, order_id: "order_not_in_persisted_store", amount: 12500, currency: "INR", status: "captured",
      } } },
    });
    const missingOrderSignature = createHmac("sha256", "route-webhook-secret").update(missingOrderEvent).digest("hex");
    const missingOrderWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": missingOrderSignature, "x-razorpay-event-id": "evt_route_test_missing_order" },
      body: missingOrderEvent,
    });
    assert.equal(missingOrderWebhook.status, 503);
    assert.equal((await missingOrderWebhook.json()).error, "payment_order_not_persisted_retry_webhook");
    assert.equal(webhookCaptureCalls, 0, "unknown order must not reach capture persistence");

    const malformedEventId = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "   " },
      body: event,
    });
    assert.equal(malformedEventId.status, 400);
    assert.equal((await malformedEventId.json()).error, "captured_payment_event_invalid");
    assert.equal(webhookCaptureCalls, 0, "blank provider event ID must not reach capture persistence");


    const paddedEventId = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_route_test padded" },
      body: event,
    });
    assert.equal(paddedEventId.status, 400);
    assert.equal((await paddedEventId.json()).error, "captured_payment_event_invalid");
    assert.equal(webhookCaptureCalls, 0, "padded provider event ID must not reach capture persistence");

    receiptNumberSourceValue = " EPER-TEST-PADDED ";
    const paddedReceiptNumberEvent = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_route_test_001" },
      body: event,
    });
    assert.equal(paddedReceiptNumberEvent.status, 503);
    assert.equal((await paddedReceiptNumberEvent.json()).error, "receipt_number_policy_unconfigured");
    assert.equal(webhookCaptureCalls, 0, "invalid receipt number policy output must not reach capture persistence");
    receiptNumberSourceValue = receiptNumber;

    const blankGatewayPaymentIdEventPayload = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: "  ", order_id: providerOrderId, amount: webhookGatewayAmount, currency: "INR", status: "captured",
      } } },
    });
    const blankGatewayPaymentIdSignature = createHmac("sha256", "route-webhook-secret").update(blankGatewayPaymentIdEventPayload).digest("hex");
    const blankGatewayPaymentIdEvent = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": blankGatewayPaymentIdSignature, "x-razorpay-event-id": "evt_blank_payment_id" },
      body: blankGatewayPaymentIdEventPayload,
    });
    assert.equal(blankGatewayPaymentIdEvent.status, 400);
    assert.equal((await blankGatewayPaymentIdEvent.json()).error, "captured_payment_event_invalid");
    assert.equal(webhookCaptureCalls, 0, "blank gateway payment ID must not reach capture persistence");

    const missingEventId = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature },
      body: event,
    });
    assert.equal(missingEventId.status, 400);
    assert.equal((await missingEventId.json()).error, "captured_payment_event_invalid");
    assert.equal(webhookCaptureCalls, 0, "webhook without provider event ID must not reach capture persistence");

    const oversizedEventId = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": "e".repeat(201),
      },
      body: event,
    });
    assert.equal(oversizedEventId.status, 400);
    assert.equal((await oversizedEventId.json()).error, "captured_payment_event_invalid");
    assert.equal(webhookCaptureCalls, 0, "oversized provider event ID must not reach capture persistence");


    const webhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_route_test_001" },
      body: event,
    });
    assert.equal(webhook.status, 200);
    assert.equal(captured, true);
    assert.equal(webhookCaptureCalls, 1);
    const webhookBody = await webhook.json();
    assert.equal(webhookBody.receiptId, receiptPublicId);
    assert.equal(webhookBody.receiptNumber, receiptNumber);
    assert.equal(webhookBody.receiptUrl, `/api/payments/receipts/${receiptPublicId}.pdf`);

    const duplicateEventId = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_route_test_001" },
      body: event,
    });
    assert.equal(duplicateEventId.status, 200);
    assert.equal(webhookCaptureCalls, 1, "replayed provider event must not issue a second capture");
    assert.equal((await duplicateEventId.json()).received, true);

    const eventConflictPayload = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: providerPaymentId, order_id: providerOrderId, amount: 12500, currency: "INR", status: "captured",
        notes: { replay: "different-payload-same-event-id" },
      } } },
    });
    const eventConflictSignature = createHmac("sha256", "route-webhook-secret").update(eventConflictPayload).digest("hex");
    const eventConflict = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": eventConflictSignature, "x-razorpay-event-id": "evt_route_test_001" },
      body: eventConflictPayload,
    });
    assert.equal(eventConflict.status, 409);
    assert.equal((await eventConflict.json()).error, "event_conflict");
    assert.equal(webhookCaptureCalls, 1, "same event ID with a different payload must not capture again");



    const verificationSignature = createHmac("sha256", "route-secret")
      .update(providerOrderId + "|" + providerPaymentId).digest("hex");
    gatewayAmount = 12000;
    const mismatchedVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(mismatchedVerification.status, 400);
    assert.equal((await mismatchedVerification.json()).error, "gateway_payment_details_mismatch");
    assert.equal(verifiedCaptureCalls, 0, "mismatched amount must never reach capture persistence");

    gatewayAmount = "12500";
    const numericPaymentIdVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": tenantId },
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: 12345,
        razorpay_signature: createHmac("sha256", "route-key-secret").update(providerOrderId + "|12345").digest("hex"),
      }),
    });
    assert.equal(numericPaymentIdVerification.status, 401);
    assert.equal((await numericPaymentIdVerification.json()).error, "unauthorized");
    assert.equal(gatewayVerificationCalls, 0, "non-string payment ID must be rejected before gateway lookup");

    const paddedPaymentIdVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": tenantId },
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: ` ${providerPaymentId}`,
        razorpay_signature: createHmac("sha256", "route-key-secret").update(providerOrderId + "|" + ` ${providerPaymentId}`).digest("hex"),
      }),
    });
    assert.equal(paddedPaymentIdVerification.status, 401);
    assert.equal((await paddedPaymentIdVerification.json()).error, "unauthorized");
    assert.equal(gatewayVerificationCalls, 0, "malformed payment ID must be rejected before gateway lookup");

    const stringAmountVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(stringAmountVerification.status, 400);
    assert.equal((await stringAmountVerification.json()).error, "gateway_payment_details_mismatch");
    assert.equal(verifiedCaptureCalls, 0, "string-valued gateway amount must not reach verification capture persistence");

    gatewayAmount = 12500.5;
    const fractionalAmountVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(fractionalAmountVerification.status, 400);
    assert.equal((await fractionalAmountVerification.json()).error, "gateway_payment_details_mismatch");
    assert.equal(verifiedCaptureCalls, 0, "fractional gateway amount must not reach verification capture persistence");

    gatewayAmount = 12500;
    receiptNumberSourceValue = " ".repeat(101);
    const invalidReceiptNumberVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(invalidReceiptNumberVerification.status, 503);
    assert.equal((await invalidReceiptNumberVerification.json()).error, "receipt_number_policy_unconfigured");
    assert.equal(verifiedCaptureCalls, 0, "oversized receipt number policy output must not reach verification capture persistence");
    receiptNumberSourceValue = receiptNumber;

    const verified = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(verified.status, 200);
    assert.equal(verifiedCaptureCalls, 1);
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

    // A missing or malformed persisted digest must fail closed even when the PDF bytes are intact.
    persistedPdf = Buffer.from(bytes);
    receipt = { ...receipt, documentPdf: persistedPdf, documentSha256: null };
    const missingDigestDownload = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(missingDigestDownload.status, 503);
    assert.equal((await missingDigestDownload.json()).error, "receipt_document_integrity_failed");

    receipt = { ...receipt, documentPdf: persistedPdf, documentSha256: "not-a-sha256-digest" };
    const malformedDigestDownload = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(malformedDigestDownload.status, 503);
    assert.equal((await malformedDigestDownload.json()).error, "receipt_document_integrity_failed");

    receipt = { ...receipt, documentPdf: persistedPdf, documentSha256: createHash("sha256").update(persistedPdf).digest("hex") };
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
