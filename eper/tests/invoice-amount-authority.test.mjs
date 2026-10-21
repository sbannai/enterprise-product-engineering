import test from "node:test";
import assert from "node:assert/strict";
import { resolveTrustedInvoiceAmount } from "../dist/packages/payments/invoice-amount-authority.js";

const invoice = {
  tenantId: "tenant-a",
  reference: "INV-2026-001",
  amountDuePaise: 12500,
  currency: "INR",
  status: "DUE",
  sourceId: "fee-ledger",
  sourceVersion: "v7",
  approvedAt: "2026-10-20T12:00:00.000Z",
};
const lookup = { tenantId: "tenant-a", reference: "INV-2026-001" };
const sourceFor = (record) => ({ findInvoice: async () => record });

test("resolves the amount only from a tenant-scoped, payable invoice with provenance", async () => {
  const result = await resolveTrustedInvoiceAmount(sourceFor(invoice), lookup);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.invoice.amountDuePaise, 12500);
});

test("fails closed when no authoritative source is wired or the invoice is missing", async () => {
  assert.deepEqual(await resolveTrustedInvoiceAmount(null, lookup), {
    ok: false, error: "invoice_source_unavailable",
  });
  assert.deepEqual(await resolveTrustedInvoiceAmount(sourceFor(null), lookup), {
    ok: false, error: "invoice_not_found",
  });
});

test("rejects tenant and reference mismatches", async () => {
  assert.deepEqual(await resolveTrustedInvoiceAmount(sourceFor({ ...invoice, tenantId: "tenant-b" }), lookup), {
    ok: false, error: "invoice_tenant_mismatch",
  });
  assert.deepEqual(await resolveTrustedInvoiceAmount(sourceFor({ ...invoice, reference: "INV-OTHER" }), lookup), {
    ok: false, error: "invoice_reference_mismatch",
  });
});

test("rejects paid, void, and cancelled invoices", async () => {
  for (const status of ["PAID", "VOID", "CANCELLED"]) {
    const result = await resolveTrustedInvoiceAmount(sourceFor({ ...invoice, status }), lookup);
    assert.deepEqual(result, { ok: false, error: "invoice_not_payable" });
  }
});

test("rejects invalid amounts, unsupported currency, and missing audit provenance", async () => {
  assert.deepEqual(await resolveTrustedInvoiceAmount(sourceFor({ ...invoice, amountDuePaise: 0 }), lookup), {
    ok: false, error: "invoice_amount_invalid",
  });
  assert.deepEqual(await resolveTrustedInvoiceAmount(sourceFor({ ...invoice, amountDuePaise: 1.2 }), lookup), {
    ok: false, error: "invoice_amount_invalid",
  });
  assert.deepEqual(await resolveTrustedInvoiceAmount(sourceFor({ ...invoice, currency: "USD" }), lookup), {
    ok: false, error: "invoice_currency_unsupported",
  });
  assert.deepEqual(await resolveTrustedInvoiceAmount(sourceFor({ ...invoice, sourceVersion: "" }), lookup), {
    ok: false, error: "invoice_provenance_missing",
  });
});

test("maps authoritative-source exceptions to a fail-closed result", async () => {
  const result = await resolveTrustedInvoiceAmount({ findInvoice: async () => { throw new Error("database unavailable"); } }, lookup);
  assert.deepEqual(result, { ok: false, error: "invoice_source_unavailable" });
});


test("rejects malformed authority status and non-date approval provenance", async () => {
  for (const malformed of [
    { ...invoice, status: "DUE_NOW" },
    { ...invoice, approvedAt: "yesterday" },
    { ...invoice, approvedAt: "" },
    { ...invoice, sourceId: "   " },
    { ...invoice, sourceVersion: null },
  ]) {
    const result = await resolveTrustedInvoiceAmount(sourceFor(malformed), lookup);
    assert.equal(result.ok, false);
    assert.equal(result.error, "invoice_not_payable" === result.error ? "invoice_not_payable" : "invoice_provenance_missing");
  }
});
