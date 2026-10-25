import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";

test("PostgreSQL payment pool requires an explicit database URL", () => {
  assert.throws(
    () => createPostgresPaymentPool({}),
    /EPER_PAYMENT_DATABASE_URL_REQUIRED/,
  );
});

test("PostgreSQL payment pool rejects non-PostgreSQL URLs", () => {
  assert.throws(
    () => createPostgresPaymentPool({ EPER_PAYMENT_DATABASE_URL: "https://example.invalid" }),
    /EPER_PAYMENT_DATABASE_URL_INVALID/,
  );
});

test("PostgreSQL payment pool constructs from explicit PostgreSQL configuration", async () => {
  const pool = createPostgresPaymentPool({
    EPER_PAYMENT_DATABASE_URL: "postgres://eper:eper_test_password@127.0.0.1:5432/eper_test",
  });
  assert.equal(typeof pool.connect, "function");
  assert.equal(typeof pool.end, "function");
  await pool.end();
});
