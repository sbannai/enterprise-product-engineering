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
