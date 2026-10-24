import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("production payment guard blocks orders, webhooks, verification, and receipt downloads before side effects", async () => {
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "production-guard-test-token".padEnd(40, "x");
  let gatewayCalls = 0;
  let storeCalls = 0;

  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "test-secret",
    RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
    EPER_PAYMENT_API_TOKEN: token,
    EPER_PAYMENT_LEDGER_FILE: "/tmp/unused-eper-payment-production-guard.json",
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "production",
  });
  globalThis.fetch = async (...args) => {
    gatewayCalls += 1;
    return nativeFetch(...args);
  };

  const paymentStore = new Proxy({}, {
    get() {
      return async () => {
        storeCalls += 1;
        throw new Error("Payment store must not be called while production guard is active");
      };
    },
  });
  const server = createAppServer({
    paymentStore,
    invoiceAmountSource: {
      async findInvoice() {
        storeCalls += 1;
        throw new Error("Invoice source must not be called while production guard is active");
      },
    },
    receiptNumberSource: async () => {
      storeCalls += 1;
      throw new Error("Receipt numbering must not be called while production guard is active");
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
    const authHeaders = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant-production-guard",
      "content-type": "application/json",
    };
    const requests = [
      ["order creation", () => nativeFetch(`${base}/api/payments/orders`, {
        method: "POST", headers: { ...authHeaders, "idempotency-key": "guard-order-1" },
        body: JSON.stringify({ tenantId: "tenant-production-guard", reference: "invoice-1" }),
      })],
      ["webhook capture", () => nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-razorpay-signature": "irrelevant" },
        body: JSON.stringify({ event: "payment.captured" }),
      })],
      ["payment verification", () => nativeFetch(`${base}/api/payments/verify`, {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ razorpay_order_id: "order-1", razorpay_payment_id: "pay-1", razorpay_signature: "irrelevant" }),
      })],
      ["receipt download", () => nativeFetch(`${base}/api/payments/receipts/9e3b1a60-2f44-4b4e-8a18-7f8e61a5d932.pdf`, {
        headers: authHeaders,
      })],
    ];

    for (const [name, request] of requests) {
      const response = await request();
      assert.equal(response.status, 503, name + " must remain disabled in production");
      assert.deepEqual(await response.json(), { error: "payment_persistence_not_production_ready" }, name);
    }
    assert.equal(gatewayCalls, 0, "production guard must prevent all outbound gateway calls");
    assert.equal(storeCalls, 0, "production guard must prevent database, invoice-source, and receipt-policy calls");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});


test("legacy JSON payment persistence is denied unless an isolated test explicitly opts in", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldPersistence = process.env.EPER_PAYMENT_PERSISTENCE;
  process.env.NODE_ENV = "test";
  delete process.env.EPER_PAYMENT_PERSISTENCE;
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/payments/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-guard", reference: "invoice-guard" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "payment_persistence_mode_not_allowed" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldPersistence === undefined) delete process.env.EPER_PAYMENT_PERSISTENCE;
    else process.env.EPER_PAYMENT_PERSISTENCE = oldPersistence;
  }
});
