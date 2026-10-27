import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "eper-admin-config-test-token-with-more-than-32-chars";
const initialEntries = [
  { productId: "uat-fee", marketId: "IN", currency: "INR", amountMinor: 12550, priceBookId: "test-book", priceBookVersion: "test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
];

test("admin UI, price-book management, resolver and vendor configuration are API-integrated", async () => {
  const keys = [
    "EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_API_TOKEN",
    "EPER_PRICING_API_ENABLED", "EPER_PRICING_API_TOKEN", "EPER_MARKET_PRICE_BOOK_JSON",
    "EPER_PAYMENT_SANDBOX_ENABLED", "EPER_PAYMENT_SANDBOX_TOKEN",
    "EPER_PAYMENT_SANDBOX_TENANT_ID", "EPER_PAYMENT_SANDBOX_PRINCIPAL_ID",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_API_TOKEN: TOKEN,
    EPER_PRICING_API_ENABLED: "true",
    EPER_PRICING_API_TOKEN: TOKEN,
    EPER_MARKET_PRICE_BOOK_JSON: JSON.stringify(initialEntries),
    EPER_PAYMENT_SANDBOX_ENABLED: "true",
    EPER_PAYMENT_SANDBOX_TOKEN: TOKEN,
    EPER_PAYMENT_SANDBOX_TENANT_ID: "admin-ui-tenant",
    EPER_PAYMENT_SANDBOX_PRINCIPAL_ID: "admin-ui-user",
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

    const ui = await fetch(`${base}/admin/pricing-ui`);
    assert.equal(ui.status, 200);
    assert.match(ui.headers.get("content-type") ?? "", /text\/html/);
    const html = await ui.text();
    assert.match(html, /Price Book/);
    assert.match(html, /Market Resolver/);
    assert.match(html, /Payment Vendor/);
    assert.match(html, /Feedback &amp; Ticketing/);
    assert.match(html, /openSupportWorkspace/);
    assert.match(html, /window.location.href="\/wireframes#support"/);

    const unauthorized = await fetch(`${base}/admin/config/price-book`);
    assert.equal(unauthorized.status, 401);

    const current = await fetch(`${base}/admin/config/price-book`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(current.status, 200);
    assert.equal((await current.json()).entries.length, 1);

    const update = await fetch(`${base}/admin/config/price-book`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ entry: {
        productId: "uat-fee", marketId: "AE", currency: "AED", amountMinor: 8500,
        priceBookId: "test-book", priceBookVersion: "test-v1", status: "APPROVED",
        effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null,
      } }),
    });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).entries.length, 2);

    const quote = await fetch(`${base}/pricing/quote`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ productId: "uat-fee", marketId: "AE" }),
    });
    assert.equal(quote.status, 200);
    const resolved = await quote.json();
    assert.deepEqual([resolved.quote.marketId, resolved.quote.currency, resolved.quote.amountMinor], ["AE", "AED", 8500]);

    const vendorGet = await fetch(`${base}/admin/config/payment-vendor`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(vendorGet.status, 200);
    const vendor = await vendorGet.json();
    assert.equal(vendor.provider, "sandbox");
    assert.equal(vendor.productionEnabled, false);
    assert.equal(vendor.adapterAvailable, true);
    assert.equal(JSON.stringify(vendor).includes("SECRET_VALUE"), false);

    const vendorUpdate = await fetch(`${base}/admin/config/payment-vendor`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ provider: "razorpay", mode: "sandbox", sandboxEnabled: true }),
    });
    assert.equal(vendorUpdate.status, 200);
    const planned = await vendorUpdate.json();
    assert.equal(planned.adapterAvailable, false);
    assert.equal(planned.productionEnabled, false);

    const payment = await fetch(`${base}/sandbox/payments`, {
      method: "POST", headers: { ...auth, "idempotency-key": "disabled-after-provider-switch" },
      body: JSON.stringify({ amountPaise: 100, description: "test" }),
    });
    assert.equal(payment.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
