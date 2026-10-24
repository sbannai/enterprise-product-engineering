import test from "node:test";
import assert from "node:assert/strict";
import { MarketPriceBookService } from "../dist/packages/pricing/market-price-book.js";

const entries = [
  { productId: "uat-fee", marketId: "IN", currency: "INR", amountMinor: 12550, priceBookId: "test-book", priceBookVersion: "test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
  { productId: "uat-fee", marketId: "AE", currency: "AED", amountMinor: 8500, priceBookId: "test-book", priceBookVersion: "test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
  { productId: "uat-fee", marketId: "US", currency: "USD", amountMinor: 3900, priceBookId: "test-book", priceBookVersion: "test-v1", status: "DRAFT", effectiveFrom: "2026-01-01T00:00:00.000Z" },
];
const now = () => new Date("2026-10-20T12:00:00.000Z");

test("market quote uses approved local price without FX conversion", () => {
  const service = new MarketPriceBookService(entries, now);
  const india = service.quote({ productId: "uat-fee", marketId: "IN" });
  const uae = service.quote({ productId: "uat-fee", marketId: "AE" });
  assert.deepEqual([india.currency, india.amountMinor], ["INR", 12550]);
  assert.deepEqual([uae.currency, uae.amountMinor], ["AED", 8500]);
  assert.notEqual(india.amountMinor, uae.amountMinor);
  assert.equal(india.quotedAt, "2026-10-20T12:00:00.000Z");
});

test("currency assertion cannot override the approved market currency", () => {
  const service = new MarketPriceBookService(entries, now);
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "AE", currency: "USD" }), /MARKET_CURRENCY_MISMATCH/);
});

test("draft or missing market prices fail closed", () => {
  const service = new MarketPriceBookService(entries, now);
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "US" }), /APPROVED_MARKET_PRICE_NOT_FOUND/);
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "GB" }), /APPROVED_MARKET_PRICE_NOT_FOUND/);
});

test("ambiguous active prices fail closed for quote and market listing", () => {
  const service = new MarketPriceBookService([
    ...entries,
    { ...entries[0], amountMinor: 15000, priceBookVersion: "test-v2" },
  ], now);
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "IN" }), /MARKET_PRICE_CONFIGURATION_AMBIGUOUS/);
  assert.throws(() => service.listMarkets("uat-fee"), /MARKET_PRICE_CONFIGURATION_AMBIGUOUS/);
});

test("malformed currency codes fail configuration validation", () => {
  assert.throws(() => new MarketPriceBookService([{ ...entries[0], currency: "inr" }], now), /MARKET_PRICE_CONFIGURATION_INVALID/);
  assert.throws(() => new MarketPriceBookService([{ ...entries[0], currency: "CAD" }], now), /MARKET_PRICE_CURRENCY_UNSUPPORTED/);
});

test("invalid amount and effective window fail configuration validation", () => {
  assert.throws(() => new MarketPriceBookService([{ ...entries[0], amountMinor: 0 }], now), /MARKET_PRICE_AMOUNT_INVALID/);
  assert.throws(() => new MarketPriceBookService([{ ...entries[0], effectiveTo: "2025-01-01T00:00:00.000Z" }], now), /MARKET_PRICE_EFFECTIVE_WINDOW_INVALID/);
});

test("market listing includes only effective approved prices in stable order", () => {
  const service = new MarketPriceBookService(entries, now);
  assert.deepEqual(service.listMarkets("uat-fee"), [
    { marketId: "AE", currency: "AED" },
    { marketId: "IN", currency: "INR" },
  ]);
});

test("invalid clock fails closed", () => {
  const service = new MarketPriceBookService(entries, () => new Date("invalid"));
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "IN" }), /MARKET_PRICE_CLOCK_INVALID/);
  assert.throws(() => service.listMarkets("uat-fee"), /MARKET_PRICE_CLOCK_INVALID/);
});

test("effective window boundaries are start-inclusive and end-exclusive", () => {
  const startsNow = new MarketPriceBookService([
    { ...entries[0], effectiveFrom: now().toISOString() },
  ], now);
  assert.equal(startsNow.quote({ productId: "uat-fee", marketId: "IN" }).amountMinor, 12550);

  const endsNow = new MarketPriceBookService([
    { ...entries[0], effectiveTo: now().toISOString() },
  ], now);
  assert.throws(
    () => endsNow.quote({ productId: "uat-fee", marketId: "IN" }),
    /APPROVED_MARKET_PRICE_NOT_FOUND/,
  );
});

test("unsafe minor-unit amounts and invalid statuses fail closed", () => {
  assert.throws(
    () => new MarketPriceBookService([{ ...entries[0], amountMinor: Number.MAX_SAFE_INTEGER + 1 }], now),
    /MARKET_PRICE_AMOUNT_INVALID/,
  );
  assert.throws(
    () => new MarketPriceBookService([{ ...entries[0], status: "PENDING" }], now),
    /MARKET_PRICE_STATUS_INVALID/,
  );
});

test("blank quote and market-list identifiers fail closed", () => {
  const service = new MarketPriceBookService(entries, now);
  assert.throws(
    () => service.quote({ productId: " ", marketId: "IN" }),
    /PRICE_PRODUCT_REQUIRED/,
  );
  assert.throws(
    () => service.quote({ productId: "uat-fee", marketId: " " }),
    /PRICE_MARKET_REQUIRED/,
  );
  assert.throws(() => service.listMarkets(" "), /PRICE_PRODUCT_REQUIRED/);
});

test("effective timestamps require a valid calendar date and explicit timezone", () => {
  for (const invalid of [
    "2026-02-30T00:00:00Z",
    "2026-02-30T00:00:00.000Z",
    "2026-01-01",
    "2026-01-01T00:00:00",
    "2026-13-01T00:00:00Z",
    "2026-01-01T25:00:00Z",
  ]) {
    assert.throws(
      () => new MarketPriceBookService([{ ...entries[0], effectiveFrom: invalid }], now),
      /MARKET_PRICE_EFFECTIVE_DATE_INVALID/,
      `expected invalid effectiveFrom to be rejected: ${invalid}`,
    );
    assert.throws(
      () => new MarketPriceBookService([{ ...entries[0], effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: invalid }], now),
      /MARKET_PRICE_EFFECTIVE_DATE_INVALID/,
      `expected invalid effectiveTo to be rejected: ${invalid}`,
    );
  }
});
