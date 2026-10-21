import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpInvoiceAmountSource,
  createConfiguredHttpInvoiceAmountSource,
} from "../dist/packages/payments/http-invoice-amount-source.js";

const invoice = {
  tenantId: "tenant-a",
  reference: "INV 2026/001",
  amountDuePaise: 12500,
  currency: "INR",
  status: "DUE",
  sourceId: "approved-fee-service",
  sourceVersion: "v17",
  approvedAt: "2026-10-20T12:00:00.000Z",
};

test("HTTP invoice authority sends tenant-scoped lookup with bearer auth and returns authority response", async () => {
  let requestedUrl;
  let requestedInit;
  const source = new HttpInvoiceAmountSource({
    endpoint: "https://fees.example.test/api/invoices/lookup",
    bearerToken: "approved-test-token-that-is-long-enough",
    fetchImpl: async (url, init) => {
      requestedUrl = new URL(String(url));
      requestedInit = init;
      return new Response(JSON.stringify(invoice), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  assert.deepEqual(await source.findInvoice({ tenantId: "tenant-a", reference: "INV 2026/001" }), invoice);
  assert.equal(requestedUrl.origin, "https://fees.example.test");
  assert.equal(requestedUrl.pathname, "/api/invoices/lookup");
  assert.equal(requestedUrl.searchParams.get("tenantId"), "tenant-a");
  assert.equal(requestedUrl.searchParams.get("reference"), "INV 2026/001");
  assert.equal(requestedInit.method, "GET");
  assert.equal(requestedInit.headers.authorization, "Bearer approved-test-token-that-is-long-enough");
  assert.equal(requestedInit.redirect, "error");
  assert.ok(requestedInit.signal);
});

test("HTTP invoice authority maps 404 to no invoice and other upstream errors to unavailable", async () => {
  const notFound = new HttpInvoiceAmountSource({
    endpoint: "https://fees.example.test/invoices",
    bearerToken: "approved-test-token-that-is-long-enough",
    fetchImpl: async () => new Response(null, { status: 404 }),
  });
  assert.equal(await notFound.findInvoice({ tenantId: "tenant-a", reference: "missing" }), null);
  const unavailable = new HttpInvoiceAmountSource({
    endpoint: "https://fees.example.test/invoices",
    bearerToken: "approved-test-token-that-is-long-enough",
    fetchImpl: async () => new Response(null, { status: 503 }),
  });
  await assert.rejects(
    unavailable.findInvoice({ tenantId: "tenant-a", reference: "INV-1" }),
    /EPER_INVOICE_AUTHORITY_REQUEST_FAILED/,
  );
});

test("HTTP invoice authority rejects unsafe endpoint configuration", () => {
  const base = { bearerToken: "approved-test-token-that-is-long-enough", fetchImpl: async () => new Response(null) };
  for (const endpoint of [
    "http://fees.example.test/invoices",
    "https://user:pass@fees.example.test/invoices",
    "https://fees.example.test/invoices?tenant=other",
    "not a url",
  ]) {
    assert.throws(() => new HttpInvoiceAmountSource({ ...base, endpoint }), /EPER_INVOICE_AUTHORITY_URL_INVALID/);
  }
  assert.throws(
    () => new HttpInvoiceAmountSource({ endpoint: "https://fees.example.test/invoices", bearerToken: "short", fetchImpl: async () => new Response(null) }),
    /EPER_INVOICE_AUTHORITY_TOKEN_REQUIRED/,
  );
});

test("runtime invoice authority stays absent when unconfigured and rejects partial configuration", () => {
  assert.equal(createConfiguredHttpInvoiceAmountSource({}), undefined);
  assert.throws(
    () => createConfiguredHttpInvoiceAmountSource({ EPER_INVOICE_AUTHORITY_URL: "https://fees.example.test/invoices" }),
    /EPER_INVOICE_AUTHORITY_CONFIGURATION_INCOMPLETE/,
  );
  const source = createConfiguredHttpInvoiceAmountSource({
    EPER_INVOICE_AUTHORITY_URL: "https://fees.example.test/invoices",
    EPER_INVOICE_AUTHORITY_TOKEN: "approved-test-token-that-is-long-enough",
  });
  assert.ok(source instanceof HttpInvoiceAmountSource);
});


test("configured HTTP invoice authority drives PostgreSQL order amount end-to-end", async () => {
  const { createAppServer } = await import("../dist/apps/api/server.js");
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "e2e-invoice-authority-test-token".padEnd(40, "x");
  let gatewayPayload = null;
  let reservedInput = null;
  let authorityCalls = 0;
  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "gateway-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: token,
    EPER_PAYMENT_LEDGER_FILE: "/tmp/unused-eper-invoice-authority-test.json",
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });
  const invoiceSource = createConfiguredHttpInvoiceAmountSource({
    EPER_INVOICE_AUTHORITY_URL: "https://fees.example.test/api/invoices/lookup",
    EPER_INVOICE_AUTHORITY_TOKEN: "approved-test-token-that-is-long-enough",
  });
  assert.ok(invoiceSource);
  // Inject a deterministic upstream transport; production uses global fetch.
  const sourceWithTestTransport = new HttpInvoiceAmountSource({
    endpoint: "https://fees.example.test/api/invoices/lookup",
    bearerToken: "approved-test-token-that-is-long-enough",
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("tenantId"), "tenant-e2e");
      assert.equal(url.searchParams.get("reference"), "INV-E2E-001");
      authorityCalls += 1;
      return new Response(JSON.stringify(invoice), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      gatewayPayload = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ id: "order_invoice_authority_e2e" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return nativeFetch(input, init);
  };
  const paymentStore = {
    async reserveOrder(input) {
      reservedInput = input;
      return { ok: true, value: { id: "101", transactionPublicId: "txn-invoice-e2e", providerOrderId: null } };
    },
    async completeOrderCreation(tenantId, idempotencyKey, providerOrderId) {
      return { ok: true, value: { id: "101", transactionPublicId: "txn-invoice-e2e", providerOrderId } };
    },
  };
  const server = createAppServer({ invoiceAmountSource: sourceWithTestTransport, paymentStore });
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
        "x-tenant-id": "tenant-e2e",
        "content-type": "application/json",
        "idempotency-key": "invoice-authority-e2e-001",
      },
      body: JSON.stringify({
        tenantId: "tenant-e2e", reference: "INV-E2E-001", amountPaise: 1,
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.payment.amountPaise, 12500);
    assert.equal(reservedInput.amountMinor, 12500);
    assert.equal(reservedInput.invoiceSourceId, invoice.sourceId);
    assert.equal(reservedInput.invoiceSourceVersion, invoice.sourceVersion);
    assert.equal(gatewayPayload.amount, 12500);
    assert.equal(gatewayPayload.currency, "INR");
    assert.equal(authorityCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});


test("API rejects a paid invoice returned by the configured authority before reservation or gateway calls", async () => {
  const { createAppServer } = await import("../dist/apps/api/server.js");
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_LEDGER_FILE", "EPER_PAYMENT_PERSISTENCE", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const token = "paid-invoice-route-test-token".padEnd(40, "x");
  let gatewayCalls = 0;
  let reservationCalls = 0;
  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "gateway-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: token,
    EPER_PAYMENT_LEDGER_FILE: "/tmp/unused-eper-paid-invoice-test.json",
    EPER_PAYMENT_PERSISTENCE: "postgres",
    NODE_ENV: "test",
  });
  globalThis.fetch = async (...args) => {
    gatewayCalls += 1;
    return nativeFetch(...args);
  };
  const paidInvoiceSource = new HttpInvoiceAmountSource({
    endpoint: "https://fees.example.test/api/invoices/lookup",
    bearerToken: "approved-test-token-that-is-long-enough",
    fetchImpl: async () => new Response(JSON.stringify({ ...invoice, status: "PAID" }), {
      status: 200, headers: { "content-type": "application/json" },
    }),
  });
  const paymentStore = {
    async reserveOrder() {
      reservationCalls += 1;
      throw new Error("paid invoices must be rejected before reservation");
    },
  };
  const server = createAppServer({ invoiceAmountSource: paidInvoiceSource, paymentStore });
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
        "x-tenant-id": "tenant-a",
        "content-type": "application/json",
        "idempotency-key": "paid-invoice-route-001",
      },
      body: JSON.stringify({ tenantId: "tenant-a", reference: "INV 2026/001", amountPaise: 1 }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "invoice_not_payable" });
    assert.equal(gatewayCalls, 0);
    assert.equal(reservationCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
