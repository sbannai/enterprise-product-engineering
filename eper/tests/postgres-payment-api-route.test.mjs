import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createAppServer } from "../dist/apps/api/server.js";

test("PostgreSQL route exposes stable transaction UUID and downloads persisted receipt by its own UUID", async () => {
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "route-test-tenant-a-token-".padEnd(40, "x");
  const tenantBToken = "route-test-tenant-b-token-".padEnd(40, "y");
  const transactionPublicId = "7d4f9b22-a34e-4d12-8c63-30f6a2e4f12a";
  const receiptPublicId = "9e3b1a60-2f44-4b4e-8a18-7f8e61a5d932";
  const tenantId = "tenant-route-test";
  const providerOrderId = "order_route_test";
  const providerPaymentId = "pay_route_test";
  const receiptNumber = "EPER-TEST-0001";
  let receiptNumberSourceValue = receiptNumber;
  let receiptNumberSourceThrows = false;
  let captured = false;
  let transactionSourceStatus = "DUE";
  let gatewayOrderStatus = 200;
  let gatewayOrderError = "definitive_rejection";
  let releasedRejectedReservations = 0;
  let transactionSourceCalls = 0;
  const reservationKeys = [];
  let webhookCaptureCalls = 0;
  let originalWebhookPayloadSha256 = null;
  let webhookGatewayAmount = 12500;
  let verifiedCaptureCalls = 0;
  let gatewayAmount = 12500;
  let gatewayReportedPaymentId = providerPaymentId;
  let gatewayVerificationCalls = 0;
  let persistedPdf = null;
  let order = {
    id: "41", transactionPublicId, tenantId, invoiceReference: "invoice-route-test",
    providerOrderId, providerPaymentId: null, amountMinor: 12500, currency: "INR",
    status: "created", createdAt: "2026-10-21T00:00:00.000Z",
  };
  let receipt = {
    receiptPublicId, orderId: "41", receiptNumber, documentSha256: null,
    documentPdf: null, issuedAt: "2026-10-21T00:00:01.000Z", transactionSnapshot: null,
  };
  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "route-secret",
    RAZORPAY_WEBHOOK_SECRET: "route-webhook-secret",
    EPER_PAYMENT_API_TOKEN: "shared-api-token-unused-for-tenant-scope".padEnd(40, "z"),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-route-test": token, "tenant-route-other": tenantBToken }),
    EPER_PAYMENT_LEDGER_FILE: "/tmp/unused-eper-payment-ledger.json",
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      if (gatewayOrderStatus >= 400) {
        return new Response(JSON.stringify({ error: gatewayOrderError }), {
          status: gatewayOrderStatus, headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: providerOrderId }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.razorpay.com/v1/payments/" + providerPaymentId) {
      gatewayVerificationCalls += 1;
      return new Response(JSON.stringify({
        id: gatewayReportedPaymentId, order_id: providerOrderId, amount: gatewayAmount, currency: "INR", status: "captured",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return nativeFetch(input, init);
  };

  const paymentStore = {
    async reserveOrder(input) {
      reservationKeys.push(input.idempotencyKey);
      // Model the immutable snapshot persisted with the order reservation.
      order = { ...order, transactionSnapshot: structuredClone(input.transactionSnapshot) };
      return { ok: true, value: { id: "41", transactionPublicId, providerOrderId: null } };
    },
    async completeOrderCreation() {
      return { ok: true, value: { id: "41", transactionPublicId, providerOrderId } };
    },
    async releaseOrderCreationAfterRejection() {
      releasedRejectedReservations += 1;
      return { ok: true, value: { id: "41" } };
    },
    async findOrderByProviderOrderId(id) { return id === providerOrderId ? { ...order } : null; },
    async capturePayment(input) {
      // The replay key is the hash of the signed raw payload, never the unsigned header.
      if (captured) {
        if (input.payloadSha256 === originalWebhookPayloadSha256) {
          return { ok: false, reason: "duplicate_event" };
        }
        // A distinct signed payload for the same already-captured payment may only
        // reuse the existing receipt; it must not capture or issue another receipt.
        return { ok: true, value: { receiptPublicId, receiptNumber } };
      }
      webhookCaptureCalls += 1;
      try {
  assert.equal(input.providerEventId, createHash("sha256").update(event).digest("hex"));
  assert.equal(input.amountMinor, webhookGatewayAmount);
  assert.equal(input.tenantId, tenantId);
  assert.equal(input.receiptNumber, receiptNumber);
  assert.deepEqual(input.transactionSnapshot, {
    tenantId, reference: "invoice-route-test", kind: "ECOMMERCE",
    description: "Route test checkout", amountDueMinor: 12500, currency: "INR", status: "DUE",
    lineItems: Array.from({ length: 40 }, (_, index) => ({
      sourceLineId: "line-route-" + (index + 1),
      description: index === 39 ? "Checkout final item with a deliberately long description to verify wrapping does not overflow the page boundary" : "Checkout item " + (index + 1),
      sku: "SKU-" + (index + 1), quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300,
    })),
    adjustments: [{ sourceAdjustmentId: "tax-route-1", kind: "TAX", description: "Checkout tax", amountMinor: 500 }],
    sourceId: "approved-cart-source", sourceVersion: "v1", approvedAt: "2026-10-20T12:00:00.000Z",
  });
  
      } catch (error) {
        return { ok: false, reason: "test_mock_capture_assertion_failed: " + (error instanceof Error ? error.message : String(error)) };
      }
      captured = true;
      receipt = { ...receipt, transactionSnapshot: input.transactionSnapshot };
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
      // The webhook already captured this exact payment and issued the receipt.
      // Model the store's idempotent retry path: return the existing receipt and
      // do not count it as a new capture or mutate the original snapshot.
      if (captured) {
        assert.equal(order.providerPaymentId, input.providerPaymentId);
        assert.equal(input.receiptNumber, receiptNumber);
        return { ok: true, value: { receiptPublicId, receiptNumber, transactionPublicId } };
      }
      verifiedCaptureCalls += 1;
      assert.equal(input.receiptNumber, receiptNumber);
      assert.equal(input.transactionSnapshot.reference, "invoice-route-test");
      assert.equal(input.transactionSnapshot.lineItems[0].description, "Checkout item 1");
      captured = true;
      order = { ...order, status: "captured", providerPaymentId: input.providerPaymentId };
      receipt = { ...receipt, transactionSnapshot: input.transactionSnapshot };
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
    receiptNumberSource: async () => {
      if (receiptNumberSourceThrows) throw new Error("approved receipt policy temporarily unavailable");
      return receiptNumberSourceValue;
    },
    transactionSnapshotSource: {
      async findTransaction({ tenantId: requestedTenant, reference }) {
        transactionSourceCalls += 1;
        if (requestedTenant !== tenantId || reference !== "invoice-route-test") return null;
        return {
          tenantId, reference, kind: "ECOMMERCE", description: "Route test checkout",
          amountDueMinor: 12500, currency: "INR", status: transactionSourceStatus,
          lineItems: Array.from({ length: 40 }, (_, index) => ({
            sourceLineId: "line-route-" + (index + 1),
            description: index === 39 ? "Checkout final item with a deliberately long description to verify wrapping does not overflow the page boundary" : "Checkout item " + (index + 1),
            sku: "SKU-" + (index + 1), quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300,
          })),
          adjustments: [{ sourceAdjustmentId: "tax-route-1", kind: "TAX", description: "Checkout tax", amountMinor: 500 }],
          sourceId: "approved-cart-source", sourceVersion: "v1", approvedAt: "2026-10-20T12:00:00.000Z",
        };
      },
    },
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

    // A tenant-A credential cannot select tenant B for order creation. Reject before
    // either trusted authority or the payment store is consulted.
    const crossTenantOrder = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers: { ...headers, "idempotency-key": "cross-tenant-order-001" },
      body: JSON.stringify({ tenantId: "tenant-route-other", reference: "invoice-route-test" }),
    });
    assert.equal(crossTenantOrder.status, 403);
    assert.equal((await crossTenantOrder.json()).error, "tenant_scope_mismatch");
    assert.equal(transactionSourceCalls, 0, "cross-tenant order must be rejected before authority lookups");

    // A caller cannot use x-tenant-id to switch the principal for verification or receipt access.
    const crossTenantVerify = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-route-other", "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(crossTenantVerify.status, 403);
    assert.equal((await crossTenantVerify.json()).error, "tenant_scope_mismatch");
    assert.equal(gatewayVerificationCalls, 0, "cross-tenant verification must be rejected before gateway lookup");

    const crossTenantReceiptBeforeLookup = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-route-other" },
    });
    assert.equal(crossTenantReceiptBeforeLookup.status, 403);
    assert.equal((await crossTenantReceiptBeforeLookup.json()).error, "tenant_scope_mismatch");

    // The global/shared token must not authenticate a tenant-scoped PostgreSQL request.
    const sharedTokenRequest = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.EPER_PAYMENT_API_TOKEN}`, "x-tenant-id": tenantId, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(sharedTokenRequest.status, 401);

    // Razorpay duplicate-receipt responses may refer to an existing provider order;
    // keep the reservation and require reconciliation rather than allowing a new order.
    gatewayOrderStatus = 400;
    gatewayOrderError = "Duplicate request";
    const duplicateOrder = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers: { ...headers, "idempotency-key": "route-duplicate-001" },
      body: JSON.stringify({ tenantId, reference: "invoice-route-test" }),
    });
    assert.equal(duplicateOrder.status, 503);
    assert.deepEqual(await duplicateOrder.json(), { error: "gateway_order_creation_outcome_unknown" });
    assert.equal(releasedRejectedReservations, 0, "duplicate response must retain reservation for reconciliation");

    // Razorpay's receipt-encoding validation response is a definitive rejection;
    // release the reservation so the invoice is not blocked indefinitely.
    gatewayOrderStatus = 400;
    gatewayOrderError = "BAD_REQUEST_ENCODING_VALIDATION_FAILED";
    const encodingRejectedOrder = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers: { ...headers, "idempotency-key": "route-encoding-rejected-001" },
      body: JSON.stringify({ tenantId, reference: "invoice-route-test" }),
    });
    assert.equal(encodingRejectedOrder.status, 502);
    assert.deepEqual(await encodingRejectedOrder.json(), { error: "gateway_order_creation_rejected" });
    assert.equal(releasedRejectedReservations, 1, "receipt encoding rejection must release its reservation");

    // A definitive provider rejection can release the in-flight reservation; the
    // original idempotency key can then be retried safely.
    gatewayOrderStatus = 422;
    gatewayOrderError = "definitive_rejection";
    const rejectedOrder = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers: { ...headers, "idempotency-key": "route-rejected-001" },
      body: JSON.stringify({ tenantId, reference: "invoice-route-test" }),
    });
    assert.equal(rejectedOrder.status, 502);
    assert.deepEqual(await rejectedOrder.json(), { error: "gateway_order_creation_rejected" });
    assert.equal(releasedRejectedReservations, 2);
    gatewayOrderStatus = 200;

    const created = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers: { ...headers, "idempotency-key": "route-rejected-001" },
      body: JSON.stringify({ tenantId, reference: "invoice-route-test" }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(reservationKeys, ["route-duplicate-001", "route-encoding-rejected-001", "route-rejected-001", "route-rejected-001"],
      "duplicate response stays reserved and retry after definitive rejection reuses its original key");
    const createdBody = await created.json();
    assert.equal(createdBody.payment.id, transactionPublicId);
    assert.match(createdBody.payment.id, /^[0-9a-f-]{36}$/i);
    assert.notEqual(createdBody.payment.id, receiptPublicId);
    assert.equal(transactionSourceCalls, 4, "each order attempt captures one authoritative snapshot");
    // Simulate the upstream invoice changing to PAID before the delayed capture webhook.
    transactionSourceStatus = "PAID";

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

    receiptNumberSourceThrows = true;
    const unavailableWebhookReceiptPolicy = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_receipt_policy_unavailable" },
      body: event,
    });
    assert.equal(unavailableWebhookReceiptPolicy.status, 503);
    assert.equal((await unavailableWebhookReceiptPolicy.json()).error, "receipt_number_policy_unconfigured");
    assert.equal(webhookCaptureCalls, 0, "receipt numbering authority outage must not reach webhook capture persistence");
    receiptNumberSourceThrows = false;

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

    const webhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_route_test_001" },
      body: event,
    });
    const webhookResultBody = await webhook.clone().json();
    assert.equal(webhook.status, 200, "initial signed webhook failed: " + JSON.stringify(webhookResultBody));
    assert.equal(captured, true);
    assert.equal(webhookCaptureCalls, 1);
    const webhookBody = await webhook.json();
    assert.equal(webhookBody.receiptId, receiptPublicId);
    assert.equal(webhookBody.receiptNumber, receiptNumber);
    assert.equal(webhookBody.receiptUrl, `/api/payments/receipts/${receiptPublicId}.pdf`);

    // A duplicate delivery must reuse the issued receipt even if the receipt-number
    // authority is temporarily unavailable after the original capture succeeded.
    receiptNumberSourceThrows = true;
    const duplicateEventId = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_route_test_001" },
      body: event,
    });
    receiptNumberSourceThrows = false;
    assert.equal(duplicateEventId.status, 200);
    assert.equal(webhookCaptureCalls, 1, "replayed provider event must not issue a second capture");
    const duplicateBody = await duplicateEventId.json();
    assert.equal(duplicateBody.received, true);
    assert.equal(duplicateBody.duplicate, true);
    assert.equal(duplicateBody.receiptId, receiptPublicId);
    assert.equal(duplicateBody.receiptNumber, receiptNumber);
    assert.equal(duplicateBody.receiptUrl, `/api/payments/receipts/${receiptPublicId}.pdf`);
    assert.equal(transactionSourceCalls, 4, "four attempted order requests each use an authoritative snapshot; webhook duplicates use the persisted snapshot");

    // Changing the unsigned event-id header must not bypass replay deduplication.
    const changedHeaderReplay = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": "attacker-chosen-new-id" },
      body: event,
    });
    assert.equal(changedHeaderReplay.status, 200);
    const changedHeaderReplayBody = await changedHeaderReplay.json();
    assert.equal(changedHeaderReplayBody.duplicate, true);
    assert.equal(changedHeaderReplayBody.receiptId, receiptPublicId);
    assert.equal(webhookCaptureCalls, 1, "changing the unsigned event-id header must not cause another capture");


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

    // The provider lookup must confirm the exact payment ID requested by the signed checkout response.
    gatewayAmount = 12500;
    gatewayReportedPaymentId = "pay_different_from_requested";
    const mismatchedPaymentIdVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(mismatchedPaymentIdVerification.status, 400);
    assert.equal((await mismatchedPaymentIdVerification.json()).error, "gateway_payment_details_mismatch");
    assert.equal(verifiedCaptureCalls, 0, "a different provider payment ID must never reach capture persistence");
    gatewayReportedPaymentId = providerPaymentId;

    gatewayAmount = "12500";
    gatewayVerificationCalls = 0; // Ignore the preceding valid-ID amount-mismatch lookup.
    const gatewayLookupsBeforeNumericId = gatewayVerificationCalls;
    const numericPaymentIdVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: 12345,
        razorpay_signature: createHmac("sha256", "route-key-secret").update(providerOrderId + "|12345").digest("hex"),
      }),
    });
    assert.equal(numericPaymentIdVerification.status, 400);
    assert.equal((await numericPaymentIdVerification.json()).error, "payment_signature_invalid");
    assert.equal(gatewayVerificationCalls, gatewayLookupsBeforeNumericId, "non-string payment ID must be rejected before gateway lookup");

    const gatewayLookupsBeforePaddedId = gatewayVerificationCalls;
    const paddedPaymentIdVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: ` ${providerPaymentId}`,
        razorpay_signature: createHmac("sha256", "route-key-secret").update(providerOrderId + "|" + ` ${providerPaymentId}`).digest("hex"),
      }),
    });
    assert.equal(paddedPaymentIdVerification.status, 400);
    assert.equal((await paddedPaymentIdVerification.json()).error, "payment_signature_invalid");
    assert.equal(gatewayVerificationCalls, gatewayLookupsBeforePaddedId, "malformed payment ID must be rejected before gateway lookup");

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
    // The webhook above already captured this order and issued its receipt. Verification
    // retries must return that stable receipt without consulting a now-unneeded numbering
    // authority or attempting a second capture.
    receiptNumberSourceValue = " ".repeat(101);
    const invalidReceiptNumberVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(invalidReceiptNumberVerification.status, 200);
    assert.equal((await invalidReceiptNumberVerification.json()).payment.receiptId, receiptPublicId);
    assert.equal(verifiedCaptureCalls, 0, "verification retry must reuse the issued receipt without a second capture");
    receiptNumberSourceThrows = true;
    const unavailableReceiptNumberVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(unavailableReceiptNumberVerification.status, 200);
    assert.equal((await unavailableReceiptNumberVerification.json()).payment.receiptId, receiptPublicId);
    assert.equal(verifiedCaptureCalls, 0, "receipt-number authority outage must not break an already captured payment retry");
    receiptNumberSourceThrows = false;

    receiptNumberSourceValue = "INVALID RECEIPT";
    const malformedReceiptNumberVerification = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: providerOrderId, razorpay_payment_id: providerPaymentId,
        razorpay_signature: verificationSignature,
      }),
    });
    assert.equal(malformedReceiptNumberVerification.status, 200);
    assert.equal((await malformedReceiptNumberVerification.json()).payment.receiptId, receiptPublicId);
    assert.equal(verifiedCaptureCalls, 0, "malformed numbering policy output must not alter an already issued receipt");
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
    assert.equal(verifiedCaptureCalls, 0, "verification after webhook capture must be idempotent");
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
    const pdfText = bytes.toString("ascii");
    assert.ok(pdfText.startsWith("%PDF-1.4\n"), "PDF header must terminate with a real newline");
    assert.ok(!pdfText.includes("\\n"), "PDF syntax must not contain literal backslash-n separators");
    const startXrefMatch = /\nstartxref\n(\d+)\n%%EOF$/.exec(pdfText);
    assert.ok(startXrefMatch, "PDF must end with startxref and EOF markers");
    const xrefOffset = Number(startXrefMatch[1]);
    assert.equal(pdfText.slice(xrefOffset, xrefOffset + 5), "xref\n", "startxref must point to the xref table");
    const xrefLines = pdfText.slice(xrefOffset).split("\n");
    const xrefCountMatch = /^0 (\d+)$/.exec(xrefLines[1] ?? "");
    assert.ok(xrefCountMatch, "xref table must declare its object count");
    const xrefObjectCount = Number(xrefCountMatch[1]);
    assert.ok(xrefObjectCount >= 2, "PDF must include catalog and page-tree objects");
    for (let objectNumber = 1; objectNumber < xrefObjectCount; objectNumber += 1) {
      const entry = xrefLines[2 + objectNumber] ?? "";
      const offsetMatch = /^(\d{10}) 00000 n $/.exec(entry);
      assert.ok(offsetMatch, "xref entry must be a valid in-use entry for object " + objectNumber);
      const objectOffset = Number(offsetMatch[1]);
      assert.ok(pdfText.startsWith(objectNumber + " 0 obj\n", objectOffset), "xref offset must point to object " + objectNumber);
    }
    assert.ok(bytes.subarray(0, 5).toString("ascii") === "%PDF-");
    assert.ok(bytes.includes(Buffer.from(receiptPublicId)));
    assert.ok(bytes.includes(Buffer.from(transactionPublicId))); // Transaction and receipt IDs are both explicit and distinct in the document.
    assert.ok(bytes.includes(Buffer.from("Amount: 125.00 INR")), "receipt total must match the gateway-confirmed amount");
    for (let itemNumber = 1; itemNumber < 40; itemNumber += 1) {
      assert.ok(bytes.includes(Buffer.from("Checkout item " + itemNumber)), "receipt must include checkout item " + itemNumber);
    }
    assert.ok(bytes.includes(Buffer.from("Checkout final item")), "long descriptions must be preserved across wrapped PDF lines");
    assert.ok(bytes.includes(Buffer.from("Adjustment: TAX Checkout tax 5.00")), "receipt must include the source-authoritative tax adjustment");
    assert.ok(bytes.includes(Buffer.from("/Count 3")), "40-item receipt with a long description must paginate across all content pages");
    const repeatedDownload = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(repeatedDownload.status, 200);
    assert.deepEqual(Buffer.from(await repeatedDownload.arrayBuffer()), bytes);

    // Legacy captured receipt with neither immutable snapshot nor stored PDF must fail closed.
    const trustedReceiptSnapshot = receipt.transactionSnapshot;
    persistedPdf = null;
    receipt = { ...receipt, transactionSnapshot: null, documentPdf: null, documentSha256: null };
    const legacyMissingSnapshotDownload = await nativeFetch(`${base}/api/payments/receipts/${receiptPublicId}.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(legacyMissingSnapshotDownload.status, 503);
    assert.equal((await legacyMissingSnapshotDownload.json()).error, "trusted_transaction_snapshot_unavailable");
    assert.equal(persistedPdf, null, "must not persist a summary-only historical receipt without its trusted snapshot");
    receipt = { ...receipt, transactionSnapshot: trustedReceiptSnapshot, documentPdf: Buffer.from(bytes), documentSha256: createHash("sha256").update(bytes).digest("hex") };
    persistedPdf = Buffer.from(bytes);

    // Reject malformed UUID-shaped receipt paths before any receipt lookup.
    const malformedReceiptId = await nativeFetch(`${base}/api/payments/receipts/aaaaaaaa-aaaa-aaaa-aaaaa-aaaaaaaaaaa.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(malformedReceiptId.status, 404);

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
    assert.equal(crossTenant.status, 403);
    assert.equal((await crossTenant.json()).error, "tenant_scope_mismatch");

    // PostgreSQL mode must never fall back to the legacy JSON-ledger receipt route.
    const legacyReceipt = await nativeFetch(`${base}/api/payments/${transactionPublicId}/receipt.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    });
    assert.equal(legacyReceipt.status, 410);
    assert.equal((await legacyReceipt.json()).error, "legacy_receipt_route_disabled_in_postgres_mode");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});

test("PostgreSQL payment mode fails closed when the durable payment store is not injected", async () => {
  const oldPersistence = process.env.EPER_PAYMENT_PERSISTENCE;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.EPER_PAYMENT_PERSISTENCE = "postgres";
  process.env.NODE_ENV = "test";
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/payments/orders`, { method: "POST" });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "payment_persistence_store_unavailable" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (oldPersistence === undefined) delete process.env.EPER_PAYMENT_PERSISTENCE;
    else process.env.EPER_PAYMENT_PERSISTENCE = oldPersistence;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});
