import test from "node:test";
import assert from "node:assert/strict";
import {
  createConfiguredHttpTransactionSnapshotSource,
  HttpTransactionSnapshotSource,
} from "../dist/packages/payments/http-transaction-snapshot-source.js";

const validSnapshot = {
  tenantId: "tenant-a",
  reference: "checkout-001",
  kind: "ECOMMERCE",
  description: "Approved checkout",
  amountDueMinor: 12500,
  currency: "INR",
  status: "DUE",
  lineItems: [{ sourceLineId: "line-1", description: "Item", quantity: 1, unitPriceMinor: 12500, lineTotalMinor: 12500 }],
  adjustments: [],
  sourceId: "approved-commerce",
  sourceVersion: "v1",
  approvedAt: "2026-10-21T10:00:00.000Z",
};

const response = (body, status = 200, headers = { "content-type": "application/json" }) =>
  new Response(body, { status, headers });

test("configured authority source requires both URL and token and rejects unsafe endpoint URLs", () => {
  assert.equal(createConfiguredHttpTransactionSnapshotSource({}), undefined);
  assert.throws(
    () => createConfiguredHttpTransactionSnapshotSource({ EPER_TRANSACTION_AUTHORITY_URL: "https://authority.example/api" }),
    /CONFIGURATION_INCOMPLETE/,
  );
  assert.throws(
    () => createConfiguredHttpTransactionSnapshotSource({
      EPER_TRANSACTION_AUTHORITY_URL: "http://authority.example/api",
      EPER_TRANSACTION_AUTHORITY_TOKEN: "x".repeat(32),
    }),
    /URL_INVALID/,
  );
  assert.throws(
    () => createConfiguredHttpTransactionSnapshotSource({
      EPER_TRANSACTION_AUTHORITY_URL: "https://user:pass@authority.example/api",
      EPER_TRANSACTION_AUTHORITY_TOKEN: "x".repeat(32),
    }),
    /URL_INVALID/,
  );
});

test("sends tenant-scoped lookup with bearer auth and refuses redirects", async () => {
  let capturedUrl;
  let capturedInit;
  const source = new HttpTransactionSnapshotSource({
    endpoint: "https://authority.example/api/transaction",
    bearerToken: "authority-test-token-1234567890",
    fetchImpl: async (url, init) => {
      capturedUrl = new URL(String(url));
      capturedInit = init;
      return response(JSON.stringify(validSnapshot));
    },
  });
  const result = await source.findTransaction({ tenantId: "tenant-a", reference: "checkout-001" });
  assert.equal(capturedUrl.searchParams.get("tenantId"), "tenant-a");
  assert.equal(capturedUrl.searchParams.get("reference"), "checkout-001");
  assert.equal(capturedInit.method, "GET");
  assert.equal(capturedInit.headers.authorization, "Bearer authority-test-token-1234567890");
  assert.equal(capturedInit.redirect, "error");
  assert.deepEqual(result, validSnapshot);
});

test("returns null for an authoritative not-found response", async () => {
  const source = new HttpTransactionSnapshotSource({
    endpoint: "https://authority.example/api/transaction",
    bearerToken: "authority-test-token-1234567890",
    fetchImpl: async () => response("", 404),
  });
  assert.equal(await source.findTransaction({ tenantId: "tenant-a", reference: "missing" }), null);
});

test("fails closed for upstream errors, invalid JSON, non-object JSON, and oversized responses", async () => {
  const makeSource = (fetchImpl) => new HttpTransactionSnapshotSource({
    endpoint: "https://authority.example/api/transaction",
    bearerToken: "authority-test-token-1234567890",
    fetchImpl,
  });
  await assert.rejects(makeSource(async () => response("unavailable", 503)).findTransaction({ tenantId: "tenant-a", reference: "checkout-001" }), /REQUEST_FAILED/);
  await assert.rejects(makeSource(async () => response("{broken")).findTransaction({ tenantId: "tenant-a", reference: "checkout-001" }), /RESPONSE_INVALID/);
  await assert.rejects(makeSource(async () => response("[]")).findTransaction({ tenantId: "tenant-a", reference: "checkout-001" }), /RESPONSE_INVALID/);
  await assert.rejects(
    makeSource(async () => response("x".repeat(65 * 1024), 200, { "content-length": String(65 * 1024) }))
      .findTransaction({ tenantId: "tenant-a", reference: "checkout-001" }),
    /RESPONSE_TOO_LARGE/,
  );
});

test("rejects invalid lookups without calling the authority", async () => {
  let calls = 0;
  const source = new HttpTransactionSnapshotSource({
    endpoint: "https://authority.example/api/transaction",
    bearerToken: "authority-test-token-1234567890",
    fetchImpl: async () => { calls += 1; return response(JSON.stringify(validSnapshot)); },
  });
  assert.equal(await source.findTransaction({ tenantId: " ", reference: "checkout-001" }), null);
  assert.equal(await source.findTransaction({ tenantId: "tenant-a", reference: " " }), null);
  assert.equal(calls, 0);
});

test("rejects malformed trusted-snapshot fields before returning upstream JSON", async () => {
  const invalidSnapshots = [
    { ...validSnapshot, tenantId: 42 },
    { ...validSnapshot, reference: "" },
    { ...validSnapshot, kind: "UNKNOWN" },
    { ...validSnapshot, amountDueMinor: "12500" },
    { ...validSnapshot, currency: "USD" },
    { ...validSnapshot, status: "CAPTURED_WITHOUT_CONTRACT" },
    { ...validSnapshot, sourceVersion: "" },
    { ...validSnapshot, approvedAt: "not-a-date" },
    { ...validSnapshot, approvedAt: "2026-02-30T10:00:00Z" },
    { ...validSnapshot, approvedAt: "2026-10-21T10:00:00" },
    { ...validSnapshot, approvedAt: "2026-10-21" },
    { ...validSnapshot, approvedAt: "2026-10-21T10:00:00+14:01" },
    { ...validSnapshot, lineItems: [{ ...validSnapshot.lineItems[0], quantity: 0 }] },
    { ...validSnapshot, lineItems: [{ ...validSnapshot.lineItems[0], lineTotalMinor: "12500" }] },
    { ...validSnapshot, lineItems: [{ ...validSnapshot.lineItems[0], lineTotalMinor: 12499 }] },
    { ...validSnapshot, amountDueMinor: 12501 },
    { ...validSnapshot, adjustments: [{ kind: "UNKNOWN", description: "Bad", amountMinor: 0 }] },
    { ...validSnapshot, adjustments: [{ kind: "FEE", description: "Bad", amountMinor: "0" }] },
    { ...validSnapshot, adjustments: [{ kind: "DISCOUNT", description: "Bad", amountMinor: 100 }] },
    { ...validSnapshot, lineItems: [] },
  ];
  for (const invalidSnapshot of invalidSnapshots) {
    const source = new HttpTransactionSnapshotSource({
      endpoint: "https://authority.example/api/transaction",
      bearerToken: "authority-test-token-1234567890",
      fetchImpl: async () => response(JSON.stringify(invalidSnapshot)),
    });
    await assert.rejects(
      source.findTransaction({ tenantId: "tenant-a", reference: "checkout-001" }),
      /RESPONSE_INVALID/,
      JSON.stringify(invalidSnapshot),
    );
  }
});
