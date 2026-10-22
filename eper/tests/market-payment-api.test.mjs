import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "market-payment-test-token-long-enough-to-pass-32-chars";
const PRICE_BOOK = [
  { productId: "uat-fee", marketId: "IN", currency: "INR", amountMinor: 12550, priceBookId: "uat-price-book", priceBookVersion: "approved-test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
  { productId: "uat-fee", marketId: "AE", currency: "AED", amountMinor: 8500, priceBookId: "uat-price-book", priceBookVersion: "approved-test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
];

test("sandbox payment amount comes from the selected market price and receipt preserves the price-book version", async () => {
  const keys = [
    "EPER_PAYMENT_SANDBOX_ENABLED", "EPER_PAYMENT_SANDBOX_TOKEN",
    "EPER_PAYMENT_SANDBOX_TENANT_ID", "EPER_PAYMENT_SANDBOX_PRINCIPAL_ID",
    "EPER_MARKET_PRICE_BOOK_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_PAYMENT_SANDBOX_ENABLED: "true",
    EPER_PAYMENT_SANDBOX_TOKEN: TOKEN,
    EPER_PAYMENT_SANDBOX_TENANT_ID: "market-tenant",
    EPER_PAYMENT_SANDBOX_PRINCIPAL_ID: "market-tester",
    EPER_MARKET_PRICE_BOOK_JSON: JSON.stringify(PRICE_BOOK),
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

    const createdResponse = await fetch(`${base}/sandbox/payments/from-quote`, {
      method: "POST", headers: { ...headers, "idempotency-key": "market-switch-payment-1" },
      body: JSON.stringify({ productId: "uat-fee", marketId: "AE", description: "Market pricing UAT fee" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.deepEqual([
      created.payment.amountMinor, created.payment.currency, created.payment.marketId,
      created.payment.priceBookId, created.payment.priceBookVersion,
    ], [8500, "AED", "AE", "uat-price-book", "approved-test-v1"]);
    assert.deepEqual([created.quote.amountMinor, created.quote.currency], [8500, "AED"]);

    const conflictingReplay = await fetch(`${base}/sandbox/payments/from-quote`, {
      method: "POST", headers: { ...headers, "idempotency-key": "market-switch-payment-1" },
      body: JSON.stringify({ productId: "uat-fee", marketId: "IN", description: "Market pricing UAT fee" }),
    });
    assert.equal(conflictingReplay.status, 409);

    const callback = await fetch(`${base}/sandbox/payments/${created.payment.id}/result`, {
      method: "POST", headers,
      body: JSON.stringify({ outcome: "SUCCEEDED", providerReference: "sandbox-market-txn-1" }),
    });
    assert.equal(callback.status, 200);

    const receiptResponse = await fetch(`${base}/sandbox/payments/${created.payment.id}/receipt`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(receiptResponse.status, 200);
    const receipt = Buffer.from(await receiptResponse.arrayBuffer()).toString("ascii");
    assert.ok(receipt.includes("85.00 AED"));
    assert.ok(receipt.includes("Market: AE"));
    assert.ok(receipt.includes("uat-price-book / approved-test-v1"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
