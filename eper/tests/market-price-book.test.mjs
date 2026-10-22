import test from "node:test";
import assert from "node:assert/strict";
import { MarketPriceBookService } from "../dist/packages/pricing/market-price-book.js";

// Test-only fixtures; these are not approved commercial prices.
const entries = [
  { productId: "uat-fee", marketId: "IN", currency: "INR", amountMinor: 12550, priceBookId: "test-book", priceBookVersion: "test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
  { productId: "uat-fee", marketId: "AE", currency: "AED", amountMinor: 8500, priceBookId: "test-book", priceBookVersion: "test-v1", status: "APPROVED", effectiveFrom: "2026-01-01T00:00:00.000Z" },
  { productId: "uat-fee", marketId: "US", currency: "USD", amountMinor: 3900, priceBookId: "test-book", priceBookVersion: "test-v1", status: "DRAFT", effectiveFrom: "2026-01-01T00:00:00.000Z" },
];
const now = () => new Date("2026-10-20T12:00:00.000Z");

test("market switch resolves a market price rather than applying FX", () => {
  const service = new MarketPriceBookService(entries, now);
  const india = service.quote({ productId: "uat-fee", marketId: "IN" });
  const uae = service.quote({ productId: "uat-fee", marketId: "AE" });
  assert.deepEqual([india.currency, india.amountMinor], ["INR", 12550]);
  assert.deepEqual([uae.currency, uae.amountMinor], ["AED", 8500]);
  assert.notEqual(india.amountMinor, uae.amountMinor);
  assert.equal(uae.priceBookVersion, "test-v1");
});

test("currency cannot override the market price book currency", () => {
  const service = new MarketPriceBookService(entries, now);
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "AE", currency: "USD" }), /MARKET_CURRENCY_MISMATCH/);
});

test("draft prices are not quotable and missing market price fails closed", () => {
  const service = new MarketPriceBookService(entries, now);
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "US" }), /APPROVED_MARKET_PRICE_NOT_FOUND/);
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "GB" }), /APPROVED_MARKET_PRICE_NOT_FOUND/);
});

test("ambiguous active price configuration fails closed for quotes", () => {
  const service = new MarketPriceBookService([
    ...entries,
    { ...entries[0], amountMinor: 15000, priceBookVersion: "test-v2" },
  ], now);
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "IN" }), /MARKET_PRICE_CONFIGURATION_AMBIGUOUS/);
});

test("invalid amount and invalid effective window are rejected at configuration time", () => {
  assert.throws(() => new MarketPriceBookService([{ ...entries[0], amountMinor: 0 }], now), /MARKET_PRICE_CONFIGURATION_INVALID/);
  assert.throws(() => new MarketPriceBookService([{ ...entries[0], effectiveTo: "2025-01-01T00:00:00.000Z" }], now), /MARKET_PRICE_EFFECTIVE_WINDOW_INVALID/);
});

test("market list contains effective approved entries only", () => {
  const service = new MarketPriceBookService(entries, now);
  assert.deepEqual(service.listMarkets("uat-fee"), [
    { marketId: "AE", currency: "AED" },
    { marketId: "IN", currency: "INR" },
  ]);
});

test("market list fails closed for duplicate active records even when currencies match", () => {
  const service = new MarketPriceBookService([
    ...entries,
    { ...entries[0], amountMinor: 12550, priceBookVersion: "test-v2" },
  ], now);
  assert.throws(() => service.listMarkets("uat-fee"), /MARKET_PRICE_CONFIGURATION_AMBIGUOUS/);
});

test("non-ISO currency codes are rejected", () => {
  assert.throws(
    () => new MarketPriceBookService([{ ...entries[0], currency: "inr" }], now),
    /MARKET_PRICE_CONFIGURATION_INVALID/,
  );
});

test("invalid clock values fail closed", () => {
  const service = new MarketPriceBookService(entries, () => new Date(Number.NaN));
  assert.throws(() => service.quote({ productId: "uat-fee", marketId: "IN" }), /MARKET_PRICE_CLOCK_INVALID/);
});

test("blank quote and market-list identifiers are rejected", () => {
  const service = new MarketPriceBookService(entries, now);
  assert.throws(() => service.quote({ productId: " ", marketId: "IN" }), /MARKET_PRICE_REQUEST_INVALID/);
  assert.throws(() => service.listMarkets(" "), /MARKET_PRICE_REQUEST_INVALID/);
});

test("impossible calendar dates and malformed timestamps are rejected", () => {
  assert.throws(
    () => new MarketPriceBookService([{ ...entries[0], effectiveFrom: "2026-02-30T00:00:00.000Z" }], now),
    /MARKET_PRICE_EFFECTIVE_WINDOW_INVALID/,
  );
  assert.throws(
    () => new MarketPriceBookService([{ ...entries[0], effectiveFrom: "2026-13-01T00:00:00.000Z" }], now),
    /MARKET_PRICE_EFFECTIVE_WINDOW_INVALID/,
  );
  assert.throws(
    () => new MarketPriceBookService([{ ...entries[0], effectiveFrom: "2026-10-20" }], now),
    /MARKET_PRICE_EFFECTIVE_WINDOW_INVALID/,
  );
});
