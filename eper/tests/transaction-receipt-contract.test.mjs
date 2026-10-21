import test from "node:test";
import assert from "node:assert/strict";
import { resolveTrustedTransactionSnapshot } from "../dist/packages/payments/transaction-receipt-contract.js";

const ecommerce = {
  tenantId: "tenant-a",
  reference: "CART-2026-001",
  kind: "ECOMMERCE",
  description: "Online checkout",
  amountDueMinor: 12500,
  currency: "INR",
  status: "DUE",
  lineItems: [
    { sourceLineId: "line-1", description: "Product A", sku: "SKU-A", quantity: 2, unitPriceMinor: 5000, lineTotalMinor: 10000 },
    { sourceLineId: "line-2", description: "Product B", sku: "SKU-B", quantity: 1, unitPriceMinor: 3000, lineTotalMinor: 3000 },
  ],
  adjustments: [
    { kind: "DISCOUNT", description: "Cart discount", amountMinor: -1000 },
    { kind: "TAX", description: "Tax", amountMinor: 500 },
  ],
  sourceId: "commerce-order-service",
  sourceVersion: "order-v12",
  approvedAt: "2026-10-21T10:00:00.000Z",
};
const lookup = { tenantId: "tenant-a", reference: "CART-2026-001" };
const sourceFor = (record) => ({ findTransaction: async () => record });

test("validates e-commerce line items and signed adjustments against the authoritative total", async () => {
  const result = await resolveTrustedTransactionSnapshot(sourceFor(ecommerce), lookup);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.transaction.amountDueMinor, 12500);
    assert.equal(result.transaction.lineItems.length, 2);
    assert.equal(result.transaction.adjustments[0].amountMinor, -1000);
    assert.notEqual(result.transaction.lineItems, ecommerce.lineItems);
  }
});

test("supports general transaction reports without checkout line items", async () => {
  const general = {
    ...ecommerce,
    kind: "GENERAL",
    description: "School fee payment",
    lineItems: [],
    adjustments: [],
    amountDueMinor: 25000,
  };
  const result = await resolveTrustedTransactionSnapshot(sourceFor(general), lookup);
  assert.equal(result.ok, true);
});

test("fails closed when source is missing, throws, or cannot find the transaction", async () => {
  assert.deepEqual(await resolveTrustedTransactionSnapshot(null, lookup), {
    ok: false, error: "transaction_source_unavailable",
  });
  assert.deepEqual(await resolveTrustedTransactionSnapshot({ findTransaction: async () => { throw new Error("offline"); } }, lookup), {
    ok: false, error: "transaction_source_unavailable",
  });
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor(null), lookup), {
    ok: false, error: "transaction_not_found",
  });
});

test("rejects tenant/reference mismatch and non-payable transactions", async () => {
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({ ...ecommerce, tenantId: "tenant-b" }), lookup), {
    ok: false, error: "transaction_tenant_mismatch",
  });
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({ ...ecommerce, reference: "OTHER" }), lookup), {
    ok: false, error: "transaction_reference_mismatch",
  });
  for (const status of ["PAID", "VOID", "CANCELLED"]) {
    assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({ ...ecommerce, status }), lookup), {
      ok: false, error: "transaction_not_payable",
    });
  }
});

test("rejects line arithmetic errors, missing e-commerce items, and unsupported currency", async () => {
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({
    ...ecommerce,
    lineItems: [{ ...ecommerce.lineItems[0], lineTotalMinor: 9999 }, ecommerce.lineItems[1]],
  }), lookup), { ok: false, error: "transaction_line_items_invalid" });
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({ ...ecommerce, lineItems: [] }), lookup), {
    ok: false, error: "transaction_line_items_invalid",
  });
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({ ...ecommerce, currency: "USD" }), lookup), {
    ok: false, error: "transaction_currency_unsupported",
  });
});

test("rejects invalid prices, invalid adjustments, and total mismatches", async () => {
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({
    ...ecommerce,
    lineItems: [{ ...ecommerce.lineItems[0], quantity: 1.5 }, ecommerce.lineItems[1]],
  }), lookup), { ok: false, error: "transaction_line_items_invalid" });
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({
    ...ecommerce,
    adjustments: [{ kind: "DISCOUNT", description: "Discount", amountMinor: -1000.5 }],
  }), lookup), { ok: false, error: "transaction_adjustments_invalid" });
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({ ...ecommerce, amountDueMinor: 12499 }), lookup), {
    ok: false, error: "transaction_total_mismatch",
  });
});

test("rejects missing audit provenance", async () => {
  assert.deepEqual(await resolveTrustedTransactionSnapshot(sourceFor({ ...ecommerce, sourceVersion: "" }), lookup), {
    ok: false, error: "transaction_provenance_missing",
  });
});
