import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../dist/apps/api/server.js";

test("Razorpay payment routes fail closed on bad signatures and scope receipts by tenant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eper-payment-test-"));
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_LEDGER_FILE",
    "EPER_PAYMENT_ALLOW_CLIENT_AMOUNT", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const secret = "razorpay-test-secret";
  const token = "t".repeat(40);
  let orderCount = 0;
  let nextPayment = {
    id: "pay_test_001",
    order_id: "order_test_001",
    amount: 12500,
    currency: "INR",
    status: "captured",
  };

  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: secret,
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: token,
    EPER_PAYMENT_LEDGER_FILE: join(dir, "payments.json"),
    EPER_PAYMENT_ALLOW_CLIENT_AMOUNT: "true",
    NODE_ENV: "test",
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      orderCount += 1;
      return new Response(JSON.stringify({ id: orderCount === 1 ? "order_test_001" : "order_test_002" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.razorpay.com/v1/payments/pay_test_001") {
      return new Response(JSON.stringify(nextPayment), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return nativeFetch(input, init);
  };

  const invoiceAmountSource = {
    async findInvoice({ tenantId, reference }) {
      if (tenantId !== "tenant-a") return null;
      return {
        tenantId, reference,
        amountDuePaise: reference === "invoice-production" ? 5000 : 12500,
        currency: "INR", status: "DUE",
        sourceId: "test-fee-ledger", sourceVersion: "v1",
        approvedAt: "2026-10-20T12:00:00.000Z",
      };
    },
  };
  const server = createAppServer({ invoiceAmountSource });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant-a",
      "content-type": "application/json",
    };

    const created = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers,
      body: JSON.stringify({
        tenantId: "tenant-a", reference: "invoice-001",
        amountPaise: 12500, currency: "INR",
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.payment.razorpayOrderId, "order_test_001");
    assert.equal(createdBody.payment.invoiceSourceId, "test-fee-ledger");
    assert.equal(createdBody.payment.invoiceSourceVersion, "v1");
    assert.equal(createdBody.payment.invoiceApprovedAt, "2026-10-20T12:00:00.000Z");

    // A correctly signed capture webhook must transition the matching order to
    // PAID, using the raw request bytes for HMAC verification.
    const pendingEvent = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: "pay_test_001", order_id: "order_test_001",
        amount: 12500, currency: "INR", status: "authorized",
      } } },
    });
    const pendingSignature = createHmac("sha256", "webhook-test-secret")
      .update(pendingEvent).digest("hex");
    const pendingWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": pendingSignature },
      body: pendingEvent,
    });
    assert.equal(pendingWebhook.status, 200);
    const pendingReceipt = await nativeFetch(`${base}/api/payments/${createdBody.payment.id}/receipt.pdf`, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-a" },
    });
    assert.equal(pendingReceipt.status, 409);

    const captureEvent = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: {
        id: "pay_test_001", order_id: "order_test_001",
        amount: 12500, currency: "INR", status: "captured",
      } } },
    });
    const webhookSignature = createHmac("sha256", "webhook-test-secret")
      .update(captureEvent).digest("hex");
    const captureWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": webhookSignature },
      body: captureEvent,
    });
    assert.equal(captureWebhook.status, 200);
    assert.equal((await captureWebhook.json()).received, true);

    // A duplicate signed capture must be harmless and must not create a second receipt.
    const duplicateCapture = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": webhookSignature },
      body: captureEvent,
    });
    assert.equal(duplicateCapture.status, 200);
    assert.equal((await duplicateCapture.json()).received, true);

    // Production must fail closed while the payment ledger is JSON-file based:
    // atomic rename is not a cross-process transaction or idempotency guarantee.
    process.env.NODE_ENV = "production";
    const productionOrder = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers,
      body: JSON.stringify({
        tenantId: "tenant-a", reference: "invoice-production",
        amountPaise: 1, currency: "INR",
      }),
    });
    assert.equal(productionOrder.status, 503);
    assert.equal((await productionOrder.json()).error, "payment_persistence_not_production_ready");

    // Keep the isolated missing-invoice-source check independent of the production persistence guard.
    process.env.NODE_ENV = "test";
    // Without a wired trusted source, order creation must fail closed.
    const unconfiguredServer = createAppServer();
    try {
      await new Promise((resolve, reject) => {
        unconfiguredServer.once("error", reject);
        unconfiguredServer.listen(0, "127.0.0.1", resolve);
      });
      const unconfiguredAddress = unconfiguredServer.address();
      assert.ok(unconfiguredAddress && typeof unconfiguredAddress === "object");
      const unconfiguredOrder = await nativeFetch(`http://127.0.0.1:${unconfiguredAddress.port}/api/payments/orders`, {
        method: "POST", headers,
        body: JSON.stringify({ tenantId: "tenant-a", reference: "invoice-no-source", amountPaise: 1, currency: "INR" }),
      });
      assert.equal(unconfiguredOrder.status, 503);
      assert.equal((await unconfiguredOrder.json()).error, "invoice_source_unavailable");
    } finally {
      await new Promise((resolve) => unconfiguredServer.close(resolve));
    }
    process.env.NODE_ENV = "test";

    const badSignature = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: "order_test_001",
        razorpay_payment_id: "pay_test_001",
        razorpay_signature: "not-a-signature",
      }),
    });
    assert.equal(badSignature.status, 400);

    const signature = createHmac("sha256", secret)
      .update("order_test_001|pay_test_001").digest("hex");
    const verified = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: "order_test_001",
        razorpay_payment_id: "pay_test_001",
        razorpay_signature: signature,
      }),
    });
    assert.equal(verified.status, 200);
    const verifiedBody = await verified.json();
    assert.equal(verifiedBody.payment.status, "PAID");
    assert.ok(verifiedBody.payment.receiptNumber);
    assert.match(verifiedBody.receiptUrl, /^\/api\/payments\/.+\/receipt\.pdf$/);

    const receipt = await nativeFetch(base + verifiedBody.receiptUrl, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-a" },
    });
    assert.equal(receipt.status, 200);
    assert.match(receipt.headers.get("content-type") ?? "", /application\/pdf/);
    assert.ok((await receipt.arrayBuffer()).byteLength > 100);

    const crossTenantReceipt = await nativeFetch(base + verifiedBody.receiptUrl, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-b" },
    });
    assert.equal(crossTenantReceipt.status, 403);

    const badWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": "bad" },
      body: JSON.stringify({ event: "payment.captured" }),
    });
    assert.equal(badWebhook.status, 401);

    nextPayment = { ...nextPayment, amount: 99999 };
    const mismatchedAmount = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: "order_test_001",
        razorpay_payment_id: "pay_test_001",
        razorpay_signature: signature,
      }),
    });
    assert.equal(mismatchedAmount.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
});


test("PostgreSQL-backed order route reserves idempotency before calling Razorpay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eper-payment-pg-route-"));
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "p".repeat(40);
  let gatewayCalls = 0;
  let reservations = 0;
  let completions = 0;
  let storedOrderId = null;

  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "razorpay-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: token,
    EPER_PAYMENT_LEDGER_FILE: join(dir, "unused-ledger.json"),
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      gatewayCalls += 1;
      return new Response(JSON.stringify({ id: "order_pg_test_001" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return nativeFetch(input, init);
  };

  const paymentStore = {
    async reserveOrder(input) {
      reservations += 1;
      assert.equal(input.tenantId, "tenant-a");
      assert.equal(input.invoiceReference, "invoice-pg-001");
      assert.equal(input.idempotencyKey, "req-pg-001");
      assert.equal(input.amountMinor, 12500);
      assert.equal(input.invoiceSourceId, "test-fee-ledger");
      assert.equal(input.invoiceSourceVersion, "v1");
      assert.equal(input.invoiceApprovedAt, "2026-10-20T12:00:00.000Z");
      return { ok: true, value: { id: "991", providerOrderId: storedOrderId } };
    },
    async completeOrderCreation(tenantId, key, providerOrderId) {
      completions += 1;
      assert.equal(tenantId, "tenant-a");
      assert.equal(key, "req-pg-001");
      storedOrderId = providerOrderId;
      return { ok: true, value: { id: "991", providerOrderId } };
    },
  };
  const invoiceAmountSource = {
    async findInvoice({ tenantId, reference }) {
      return tenantId === "tenant-a" && reference === "invoice-pg-001" ? {
        tenantId, reference, amountDuePaise: 12500, currency: "INR", status: "DUE",
        sourceId: "test-fee-ledger", sourceVersion: "v1",
        approvedAt: "2026-10-20T12:00:00.000Z",
      } : null;
    },
  };
  const server = createAppServer({ invoiceAmountSource, paymentStore });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant-a",
      "content-type": "application/json",
      "idempotency-key": "req-pg-001",
    };
    const request = () => nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers,
      body: JSON.stringify({ tenantId: "tenant-a", reference: "invoice-pg-001", amountPaise: 1 }),
    });
    const first = await request();
    assert.equal(first.status, 201);
    assert.equal((await first.json()).payment.razorpayOrderId, "order_pg_test_001");
    const retry = await request();
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).payment.razorpayOrderId, "order_pg_test_001");
    assert.equal(reservations, 2);
    assert.equal(completions, 1);
    assert.equal(gatewayCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
