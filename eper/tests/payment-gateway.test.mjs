import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../dist/apps/api/server.js";
import { receiptPdf } from "../dist/apps/api/payments.js";

test("Razorpay payment routes fail closed on bad signatures and scope receipts by tenant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eper-payment-test-"));
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_LEDGER_FILE",
    "EPER_PAYMENT_ALLOW_CLIENT_AMOUNT", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const secret = "razorpay-test-secret";
  const token = "t".repeat(40);
  let orderCount = 0;
  let requestedOrderPayload;
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
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-a": token }),
    EPER_PAYMENT_LEDGER_FILE: join(dir, "payments.json"),
    EPER_PAYMENT_ALLOW_CLIENT_AMOUNT: "true",
    NODE_ENV: "test",
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      requestedOrderPayload = JSON.parse(String(init?.body ?? "{}"));
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
        tenantId, reference, applicationId: "application-a",
        amountDuePaise: reference === "invoice-production" ? 5000 : 12500,
        currency: "INR", status: "DUE",
        sourceId: "test-fee-ledger", sourceVersion: "v1",
        approvedAt: "2026-10-20T12:00:00.000Z",
      };
    },
  };
  const server = createAppServer({ invoiceAmountSource, allowLegacyPaymentLedgerForTests: true });
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
        // Deliberately contradict the trusted invoice amount; client input must not control the gateway order.
        amountPaise: 1, currency: "INR",
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.payment.razorpayOrderId, "order_test_001");
    assert.equal(requestedOrderPayload.amount, 12500, "gateway order amount must come from the trusted invoice, not client amountPaise");
    assert.equal(requestedOrderPayload.currency, "INR");
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
    const unconfiguredServer = createAppServer({ allowLegacyPaymentLedgerForTests: true });
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
    assert.match(verifiedBody.payment.receiptId, /^[0-9a-f-]{36}$/i);
    assert.match(verifiedBody.payment.id, /^[0-9a-f-]{36}$/i);
    assert.notEqual(verifiedBody.payment.receiptId, verifiedBody.payment.id);
    assert.match(verifiedBody.receiptUrl, /^\/api\/payments\/receipts\/[0-9a-f-]{36}\.pdf$/i);

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
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
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
    EPER_PAYMENT_API_TOKEN: "shared-api-token-unused-for-tenant-scope".padEnd(40, "z"),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-a": token }),
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
        tenantId, reference, applicationId: "application-a", amountDuePaise: 12500, currency: "INR", status: "DUE",
        sourceId: "test-fee-ledger", sourceVersion: "v1",
        approvedAt: "2026-10-20T12:00:00.000Z",
      } : null;
    },
  };
  const server = createAppServer({
    invoiceAmountSource,
    paymentStore,
    transactionSnapshotSource: {
      async findTransaction({ tenantId, reference }) {
        if (tenantId !== "tenant-a" || !reference.startsWith("invoice-")) return null;
        return {
          tenantId, reference, kind: "GENERAL", description: "Approved fee transaction",
          amountDueMinor: 12500, currency: "INR", status: "DUE",
          lineItems: [], adjustments: [],
          sourceId: "test-fee-ledger", sourceVersion: "v1",
          approvedAt: "2026-10-20T12:00:00.000Z",
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


test("PostgreSQL-backed order route does not create a second gateway order after an ambiguous provider timeout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eper-payment-pg-timeout-"));
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "q".repeat(40);
  let gatewayCalls = 0;
  let reservations = 0;

  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "razorpay-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: "shared-api-token-unused-for-tenant-scope".padEnd(40, "z"),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-a": token }),
    EPER_PAYMENT_LEDGER_FILE: join(dir, "unused-ledger.json"),
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      gatewayCalls += 1;
      // Simulate a timeout after the provider may already have accepted the request.
      throw new TypeError("simulated network timeout");
    }
    return nativeFetch(input);
  };

  const paymentStore = {
    async reserveOrder() {
      reservations += 1;
      if (reservations === 1) {
        return { ok: true, value: { id: "992", transactionPublicId: "txn-public-992", providerOrderId: null } };
      }
      return { ok: false, reason: "order_creation_reconciliation_required" };
    },
  };
  const invoiceAmountSource = {
    async findInvoice({ tenantId, reference }) {
      return tenantId === "tenant-a" && reference === "invoice-timeout-001" ? {
        tenantId, reference, applicationId: "application-a", amountDuePaise: 12500, currency: "INR", status: "DUE",
        sourceId: "test-fee-ledger", sourceVersion: "v1",
        approvedAt: "2026-10-20T12:00:00.000Z",
      } : null;
    },
  };
  const server = createAppServer({
    invoiceAmountSource,
    paymentStore,
    transactionSnapshotSource: {
      async findTransaction({ tenantId, reference }) {
        if (tenantId !== "tenant-a" || !reference.startsWith("invoice-")) return null;
        return {
          tenantId, reference, kind: "GENERAL", description: "Approved fee transaction",
          amountDueMinor: 12500, currency: "INR", status: "DUE",
          lineItems: [], adjustments: [],
          sourceId: "test-fee-ledger", sourceVersion: "v1",
          approvedAt: "2026-10-20T12:00:00.000Z",
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
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant-a",
      "content-type": "application/json",
      "idempotency-key": "req-timeout-001",
    };
    const request = () => nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers,
      body: JSON.stringify({ tenantId: "tenant-a", reference: "invoice-timeout-001", amountPaise: 1 }),
    });

    const first = await request();
    assert.equal(first.status, 503);
    assert.equal((await first.json()).error, "gateway_order_creation_outcome_unknown");
    const retry = await request();
    assert.equal(retry.status, 503);
    assert.equal((await retry.json()).error, "order_creation_reconciliation_required");
    assert.equal(gatewayCalls, 1, "ambiguous provider timeout must not trigger a second gateway order");
    assert.equal(reservations, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});


test("PostgreSQL-backed order route requires reconciliation when provider order persistence fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eper-payment-pg-persist-failure-"));
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "r".repeat(40);
  let gatewayCalls = 0;
  let reservations = 0;
  let completionCalls = 0;

  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "razorpay-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: "shared-api-token-unused-for-tenant-scope".padEnd(40, "z"),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-a": token }),
    EPER_PAYMENT_LEDGER_FILE: join(dir, "unused-ledger.json"),
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      gatewayCalls += 1;
      return new Response(JSON.stringify({ id: "order_persist_test_001" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return nativeFetch(input);
  };

  const paymentStore = {
    async reserveOrder() {
      reservations += 1;
      if (reservations === 1) {
        return { ok: true, value: { id: "993", transactionPublicId: "txn-public-993", providerOrderId: null } };
      }
      return { ok: false, reason: "order_creation_reconciliation_required" };
    },
    async completeOrderCreation() {
      completionCalls += 1;
      return { ok: false, reason: "not_found" };
    },
  };
  const invoiceAmountSource = {
    async findInvoice({ tenantId, reference }) {
      return tenantId === "tenant-a" && reference === "invoice-persist-failure-001" ? {
        tenantId, reference, applicationId: "application-a", amountDuePaise: 12500, currency: "INR", status: "DUE",
        sourceId: "test-fee-ledger", sourceVersion: "v1",
        approvedAt: "2026-10-20T12:00:00.000Z",
      } : null;
    },
  };
  const server = createAppServer({
    invoiceAmountSource,
    paymentStore,
    transactionSnapshotSource: {
      async findTransaction({ tenantId, reference }) {
        if (tenantId !== "tenant-a" || !reference.startsWith("invoice-")) return null;
        return {
          tenantId, reference, kind: "GENERAL", description: "Approved fee transaction",
          amountDueMinor: 12500, currency: "INR", status: "DUE",
          lineItems: [], adjustments: [],
          sourceId: "test-fee-ledger", sourceVersion: "v1",
          approvedAt: "2026-10-20T12:00:00.000Z",
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
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant-a",
      "content-type": "application/json",
      "idempotency-key": "req-persist-failure-001",
    };
    const request = () => nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers,
      body: JSON.stringify({ tenantId: "tenant-a", reference: "invoice-persist-failure-001", amountPaise: 1 }),
    });

    const first = await request();
    assert.equal(first.status, 503);
    assert.equal((await first.json()).error, "payment_order_persistence_reconciliation_required");
    const retry = await request();
    assert.equal(retry.status, 503);
    assert.equal((await retry.json()).error, "order_creation_reconciliation_required");
    assert.equal(gatewayCalls, 1, "provider order persistence failure must not trigger a second gateway order");
    assert.equal(reservations, 2);
    assert.equal(completionCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});


test("PostgreSQL order creation fails closed without an authoritative invoice source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eper-payment-no-invoice-source-"));
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "s".repeat(40);
  let gatewayCalls = 0;
  let storeCalls = 0;

  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "test-secret",
    RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
    EPER_PAYMENT_API_TOKEN: "shared-api-token-unused-for-tenant-scope".padEnd(40, "z"),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-no-invoice-source": token }),
    EPER_PAYMENT_LEDGER_FILE: join(dir, "unused-ledger.json"),
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });
  globalThis.fetch = async (...args) => {
    gatewayCalls += 1;
    return nativeFetch(...args);
  };
  const paymentStore = {
    async reserveOrder() {
      storeCalls += 1;
      throw new Error("must not reserve an order before invoice authority is verified");
    },
  };
  // Deliberately omit invoiceAmountSource to model the current unconfigured integration.
  const server = createAppServer({ paymentStore });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await nativeFetch(`http://127.0.0.1:${address.port}/api/payments/orders`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant-no-invoice-source",
        "content-type": "application/json",
        "idempotency-key": "no-invoice-source-001",
      },
      body: JSON.stringify({
        tenantId: "tenant-no-invoice-source",
        reference: "invoice-not-connected",
        amountPaise: 1,
      }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "invoice_source_unavailable" });
    assert.equal(gatewayCalls, 0, "missing invoice authority must never contact Razorpay");
    assert.equal(storeCalls, 0, "missing invoice authority must never reserve a payment order");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});


test("PostgreSQL receipt download fails closed when persisted PDF digest does not match", async () => {
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const token = "receipt-integrity-test-token".padEnd(40, "x");
  const receiptPublicId = "d6e51a2e-80de-45e6-ae93-f10a46f3b6e9";
  const storedPdf = Buffer.from("%PDF-1.4\noriginal receipt\n%%EOF", "ascii");
  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "gateway-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: "shared-api-token-unused-for-tenant-scope".padEnd(40, "z"),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-a": token }),
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });
  let orderLookups = 0;
  const paymentStore = {
    async findReceiptByPublicId(tenantId, requestedId) {
      assert.equal(requestedId, receiptPublicId);
      if (tenantId !== "tenant-a") return null;
      return {
        receiptPublicId, orderId: "41", receiptNumber: "APPROVED-RECEIPT-00041",
        documentSha256: "0".repeat(64), documentPdf: storedPdf,
        issuedAt: "2026-10-21T07:00:00.000Z",
      };
    },
    async findOrderByInternalId(tenantId, orderId) {
      orderLookups += 1;
      assert.equal(tenantId, "tenant-a");
      assert.equal(orderId, "41");
      return {
        id: "41", transactionPublicId: "a6e51a2e-80de-45e6-ae93-f10a46f3b6e9",
        tenantId: "tenant-a", invoiceReference: "INV-41", providerOrderId: "order_41",
        providerPaymentId: "pay_41", amountMinor: 12500, currency: "INR",
        status: "captured", createdAt: "2026-10-21T06:00:00.000Z",
      };
    },
  };
  const server = createAppServer({ paymentStore });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}/api/payments/receipts/${receiptPublicId}.pdf`;
    const crossTenant = await fetch(base, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-b" },
    });
    assert.equal(crossTenant.status, 403);
    assert.deepEqual(await crossTenant.json(), { error: "tenant_scope_mismatch" });
    assert.equal(orderLookups, 0, "cross-tenant receipt requests must not reach order lookup");

    const response = await fetch(base, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-a" },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "receipt_document_integrity_failed" });
    assert.equal(orderLookups, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});


test("PostgreSQL receipt download persists PDF once and serves identical bytes on retries", async () => {
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const token = "receipt-stability-test-token".padEnd(40, "x");
  const receiptPublicId = "f6e51a2e-80de-45e6-ae93-f10a46f3b6e9";
  const transactionSnapshot = {
    tenantId: "tenant-a", applicationId: "application-a", reference: "INV-41", kind: "GENERAL",
    description: "Receipt stability test", amountDueMinor: 12500, currency: "INR",
    status: "DUE", lineItems: [], adjustments: [], sourceId: "test-authority",
    sourceVersion: "v1", approvedAt: "2026-10-21T06:00:00.000Z",
  };
  let persistedPdf = null;
  let persistedDigest = null;
  let persistCalls = 0;
  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "gateway-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: "shared-api-token-unused-for-tenant-scope".padEnd(40, "z"),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-a": token }),
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });
  const paymentStore = {
    async findReceiptByPublicId(tenantId, requestedId) {
      if (tenantId !== "tenant-a" || requestedId !== receiptPublicId) return null;
      return {
        receiptPublicId, orderId: "41", receiptNumber: "APPROVED-RECEIPT-00041",
        transactionSnapshot, documentSha256: persistedDigest, documentPdf: persistedPdf,
        issuedAt: "2026-10-21T07:00:00.000Z",
      };
    },
    async findOrderByInternalId(tenantId, orderId) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(orderId, "41");
      return {
        id: "41", transactionPublicId: "a6e51a2e-80de-45e6-ae93-f10a46f3b6e9",
        tenantId: "tenant-a", invoiceReference: "INV-41", providerOrderId: "order_41",
        providerPaymentId: "pay_41", amountMinor: 12500, currency: "INR",
        status: "captured", createdAt: "2026-10-21T06:00:00.000Z",
      };
    },
    async persistReceiptDocument(tenantId, orderId, pdf) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(orderId, "41");
      persistCalls += 1;
      if (persistedPdf && !persistedPdf.equals(pdf)) return { ok: false, reason: "receipt_document_conflict" };
      persistedPdf = Buffer.from(pdf);
      persistedDigest = createHash("sha256").update(persistedPdf).digest("hex");
      return { ok: true, value: { documentSha256: persistedDigest } };
    },
    async findReceipt(tenantId, orderId) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(orderId, "41");
      return {
        receiptPublicId, orderId, receiptNumber: "APPROVED-RECEIPT-00041",
        documentSha256: persistedDigest, documentPdf: persistedPdf,
        issuedAt: "2026-10-21T07:00:00.000Z",
      };
    },
  };
  const server = createAppServer({ paymentStore });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/api/payments/receipts/${receiptPublicId}.pdf`;
    const headers = { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-a" };
    const first = await fetch(url, { headers });
    assert.equal(first.status, 200);
    const firstBytes = Buffer.from(await first.arrayBuffer());
    assert.ok(firstBytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
    assert.equal(persistCalls, 1);

    const second = await fetch(url, { headers });
    assert.equal(second.status, 200);
    const secondBytes = Buffer.from(await second.arrayBuffer());
    assert.deepEqual(secondBytes, firstBytes);
    assert.equal(persistCalls, 1, "retry must serve persisted PDF without re-issuing the receipt");
    assert.equal(createHash("sha256").update(secondBytes).digest("hex"), persistedDigest);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});


test("receipt PDF paginates long checkout snapshots without dropping items or adjustments", () => {
  const lineItems = Array.from({ length: 40 }, (_, index) => ({
    sourceLineId: `line-${index + 1}`,
    description: `Product ${String(index + 1).padStart(2, "0")}`,
    sku: `SKU-${index + 1}`,
    quantity: 1,
    unitPriceMinor: 100,
    lineTotalMinor: 100,
  }));
  const record = {
    id: "transaction-public-unique-id",
    tenantId: "tenant-a",
    reference: "CART-LONG-001",
    invoiceSourceId: "invoice-authority",
    invoiceSourceVersion: "v12",
    invoiceApprovedAt: "2026-10-21T10:00:00.000Z",
    amountPaise: 3900,
    currency: "INR",
    status: "PAID",
    razorpayOrderId: "order-long-001",
    razorpayPaymentId: "pay-long-001",
    receiptNumber: "TEST-RECEIPT-0001",
    receiptId: "receipt-public-unique-id",
    createdAt: "2026-10-21T10:00:00.000Z",
    paidAt: "2026-10-21T10:01:00.000Z",
    transactionSnapshot: {
      tenantId: "tenant-a",
      applicationId: "application-a",
      reference: "CART-LONG-001",
      kind: "ECOMMERCE",
      description: "Long multi-item checkout",
      amountDueMinor: 3900,
      currency: "INR",
      status: "DUE",
      lineItems,
      adjustments: [
        { kind: "DISCOUNT", description: "Cart promotion", amountMinor: -200 },
        { kind: "CONCESSION", description: "Approved tuition concession", amountMinor: -300 },
        { kind: "TAX", description: "Tax", amountMinor: 100 },
      ],
      sourceId: "checkout-service",
      sourceVersion: "cart-v12",
      approvedAt: "2026-10-21T10:00:00.000Z",
    },
  };

  const first = receiptPdf(record);
  const second = receiptPdf(record);
  const pdfText = first.toString("ascii");
  const pageCount = (pdfText.match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pageCount >= 2, `expected multiple PDF pages, got ${pageCount}`);
  for (const item of lineItems) {
    assert.ok(pdfText.includes(`Item: ${item.description}`), `missing receipt line for ${item.description}`);
  }
  assert.ok(pdfText.includes("Adjustment: DISCOUNT Cart promotion -2.00"));
  assert.ok(pdfText.includes("Concession: Approved tuition concession -3.00"), "approved concession must be labelled clearly on the receipt");
  assert.ok(pdfText.includes("Adjustment: TAX Tax 1.00"));
  assert.ok(pdfText.includes("Transaction ID: transaction-public-unique-id"));
  assert.ok(pdfText.includes("Receipt ID: receipt-public-unique-id"));
  assert.deepEqual(second, first, "same persisted receipt metadata must render byte-identical PDF bytes");
  assert.equal(createHash("sha256").update(second).digest("hex"), createHash("sha256").update(first).digest("hex"));

  // A single unusually long product description must wrap across rendered
  // lines without losing characters or overflowing a page.
  const longDescription = "LongProductDescription-".repeat(12);
  const longRecord = {
    ...record,
    transactionSnapshot: {
      ...record.transactionSnapshot,
      lineItems: [
        { ...lineItems[0], description: longDescription },
        ...lineItems.slice(1),
      ],
    },
  };
  const longPdfText = receiptPdf(longRecord).toString("ascii");
  const extractTextOperands = (pdfText) => [...pdfText.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((match) => match[1].replace(/\\([\\()])/g, "$1"));
  const renderedText = extractTextOperands(longPdfText).join("");
  assert.ok(renderedText.includes(longDescription), "long product description must survive wrapping");

  // Wide glyphs must wrap by measured Helvetica width, not a fixed character count.
  const wideDescription = "W".repeat(180);
  const wideRecord = {
    ...record,
    transactionSnapshot: {
      ...record.transactionSnapshot,
      lineItems: [{ ...lineItems[0], description: wideDescription }],
    },
  };
  const widePdf = receiptPdf(wideRecord).toString("ascii");
  const wideOperands = extractTextOperands(widePdf);
  assert.ok(wideOperands.join("").includes(wideDescription), "wide-glyph content must not be lost");
  for (const operand of wideOperands) {
    assert.ok(
      (operand.match(/W/g) ?? []).length <= 52,
      "no 10pt receipt text operand may contain more than 52 Helvetica W glyphs",
    );
  }
  assert.deepEqual(receiptPdf(wideRecord), receiptPdf(wideRecord), "wide-glyph PDF output must be deterministic");
});
