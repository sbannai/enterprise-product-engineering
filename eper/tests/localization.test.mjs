import test from "node:test";
import assert from "node:assert/strict";
import { LocalizationService, convertMoney } from "../dist/packages/localization/localization.js";

test("localization options expose English, Telugu, Hindi and selectable currencies", () => {
  const service = new LocalizationService();
  const options = service.options();
  assert.deepEqual(options.locales.map((item) => item.code), ["en-IN", "te-IN", "hi-IN"]);
  assert.deepEqual(options.currencies.map((item) => item.code), ["INR", "USD", "EUR", "GBP", "AED"]);
});

test("language, currency and timezone preferences can be switched per tenant and principal", () => {
  const service = new LocalizationService();
  assert.deepEqual(service.getPreference("tenant-a", "user-1"), {
    locale: "en-IN", currency: "INR", timeZone: "Asia/Kolkata",
  });
  service.setPreference("tenant-a", "user-1", { locale: "te-IN", currency: "USD", timeZone: "Asia/Dubai" });
  assert.deepEqual(service.getPreference("tenant-a", "user-1"), {
    locale: "te-IN", currency: "USD", timeZone: "Asia/Dubai",
  });
  assert.deepEqual(service.getPreference("tenant-a", "user-2"), {
    locale: "en-IN", currency: "INR", timeZone: "Asia/Kolkata",
  });
  assert.deepEqual(service.getPreference("tenant-b", "user-1"), {
    locale: "en-IN", currency: "INR", timeZone: "Asia/Kolkata",
  });
});

test("localized messages are translated for each supported language", () => {
  const service = new LocalizationService();
  assert.equal(service.translate("en-IN", "downloadReceipt"), "Download receipt");
  assert.equal(service.translate("te-IN", "downloadReceipt"), "రసీదును డౌన్‌లోడ్ చేయండి");
  assert.equal(service.translate("hi-IN", "downloadReceipt"), "रसीद डाउनलोड करें");
});

test("money and dates format according to selected locale, currency and timezone", () => {
  const service = new LocalizationService();
  assert.match(service.formatMoney(125.5, "INR", "en-IN"), /125/);
  assert.match(service.formatMoney(125.5, "USD", "en-IN"), /125/);
  assert.notEqual(
    service.formatDate("2026-10-20T12:00:00Z", "en-IN", "Asia/Kolkata"),
    service.formatDate("2026-10-20T12:00:00Z", "en-IN", "America/New_York"),
  );
});

test("unsupported locale/currency and invalid date/amount are rejected", () => {
  const service = new LocalizationService();
  assert.throws(() => service.setPreference("tenant-a", "user-1", { locale: "xx-XX" as never }), /LOCALE_UNSUPPORTED/);
  assert.throws(() => service.setPreference("tenant-a", "user-1", { currency: "XYZ" as never }), /CURRENCY_UNSUPPORTED/);
  assert.throws(() => service.formatMoney(Number.NaN, "INR", "en-IN"), /MONEY_AMOUNT_INVALID/);
  assert.throws(() => service.formatDate("not-a-date", "en-IN", "Asia/Kolkata"), /DATE_INVALID/);
});

test("currency conversion requires a sourced timestamped FX rate and rounds to minor units", () => {
  assert.equal(convertMoney(100, {
    source: "approved-test-fixture", asOf: "2026-10-20T00:00:00Z", rate: 1.25, from: "USD", to: "EUR",
  }), 125);
  assert.throws(() => convertMoney(100, {
    source: "", asOf: "2026-10-20T00:00:00Z", rate: 1.25, from: "USD", to: "EUR",
  }), /FX_RATE_SOURCE_AND_TIMESTAMP_REQUIRED/);
  assert.throws(() => convertMoney(100, {
    source: "fixture", asOf: "2026-10-20T00:00:00Z", rate: 0, from: "USD", to: "EUR",
  }), /FX_RATE_INVALID/);
});
