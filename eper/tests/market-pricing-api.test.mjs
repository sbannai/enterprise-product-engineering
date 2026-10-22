import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "pricing-api-test-token-long-enough-to-pass-32-chars";
const PRICE_BOOK = [
  { productId: "uat-fee", marketId: "IN", currency: "INR", amountMinor: 12550, priceBookId: "test-book", priceBookVersion: "test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
  { productId: "uat-fee", marketId: "AE", currency: "AED", amountMinor: 8500, priceBookId: "test-book", priceBookVersion: "test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
];

test("pricing API returns market-specific quote amounts and rejects currency overrides", async () => {
  const keys = ["EPER_PRICING_API_ENABLED", "EPER_PRICING_API_TOKEN", "EPER_MARKET_PRICE_BOOK_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_PRICING_API_ENABLED: "true",
    EPER_PRICING_API_TOKEN: TOKEN,
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
    const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

    const unauthenticated = await fetch(`${base}/pricing/quote`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "uat-fee", marketId: "IN" }),
    });
    assert.equal(unauthenticated.status, 401);

    const indiaResponse = await fetch(`${base}/pricing/quote`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ productId: "uat-fee", marketId: "IN" }),
    });
    assert.equal(indiaResponse.status, 200);
    const india = await indiaResponse.json();
    assert.deepEqual([india.quote.currency, india.quote.amountMinor, india.amountMajor], ["INR", 12550, 125.5]);

    const uaeResponse = await fetch(`${base}/pricing/quote`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ productId: "uat-fee", marketId: "AE" }),
    });
    assert.equal(uaeResponse.status, 200);
    const uae = await uaeResponse.json();
    assert.deepEqual([uae.quote.currency, uae.quote.amountMinor, uae.amountMajor], ["AED", 8500, 85]);
    assert.notEqual(india.quote.amountMinor, uae.quote.amountMinor);

    const mismatch = await fetch(`${base}/pricing/quote`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ productId: "uat-fee", marketId: "AE", currency: "USD" }),
    });
    assert.equal(mismatch.status, 400);

    const options = await fetch(`${base}/pricing/options?productId=uat-fee`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(options.status, 200);
    assert.deepEqual((await options.json()).markets, [
      { marketId: "AE", currency: "AED" },
      { marketId: "IN", currency: "INR" },
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
