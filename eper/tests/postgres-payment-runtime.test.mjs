import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";

const TEST_URL = "postgres://eper:eper_test_password@127.0.0.1:5432/eper_test";

test("PostgreSQL payment pool requires an explicit database URL", () => {
  assert.throws(() => createPostgresPaymentPool({}), /EPER_PAYMENT_DATABASE_URL_REQUIRED/);
});

test("PostgreSQL payment pool rejects non-PostgreSQL URLs", () => {
  assert.throws(
    () => createPostgresPaymentPool({ EPER_PAYMENT_DATABASE_URL: "https://example.invalid" }),
    /EPER_PAYMENT_DATABASE_URL_INVALID/,
  );
});

test("PostgreSQL pool defaults to a bounded pool and defensive timeouts", async () => {
  const pool = createPostgresPaymentPool({ EPER_PAYMENT_DATABASE_URL: TEST_URL });
  try {
    assert.equal(pool.options.max, 10);
    assert.equal(pool.options.connectionTimeoutMillis, 5_000);
    assert.equal(pool.options.idleTimeoutMillis, 30_000);
    assert.equal(pool.options.statement_timeout, 15_000);
    assert.equal(pool.options.query_timeout, 20_000);
    assert.equal(pool.options.lock_timeout, 5_000);
    assert.equal(pool.options.idle_in_transaction_session_timeout, 10_000);
    assert.equal(pool.options.application_name, "eper-api");
  } finally {
    await pool.end();
  }
});

test("PostgreSQL pool accepts bounded deployment overrides", async () => {
  const pool = createPostgresPaymentPool({
    EPER_PAYMENT_DATABASE_URL: TEST_URL,
    EPER_PG_POOL_MAX: "16",
    EPER_PG_CONNECTION_TIMEOUT_MS: "8000",
    EPER_PG_STATEMENT_TIMEOUT_MS: "25000",
  });
  try {
    assert.equal(pool.options.max, 16);
    assert.equal(pool.options.connectionTimeoutMillis, 8_000);
    assert.equal(pool.options.statement_timeout, 25_000);
  } finally {
    await pool.end();
  }
});

test("PostgreSQL pool rejects invalid or unsafe pool sizing", () => {
  assert.throws(() => createPostgresPaymentPool({
    EPER_PAYMENT_DATABASE_URL: TEST_URL, EPER_PG_POOL_MAX: "0",
  }), /EPER_PG_POOL_MAX_OUT_OF_RANGE/);
  assert.throws(() => createPostgresPaymentPool({
    EPER_PAYMENT_DATABASE_URL: TEST_URL, EPER_PG_POOL_MAX: "1000",
  }), /EPER_PG_POOL_MAX_OUT_OF_RANGE/);
  assert.throws(() => createPostgresPaymentPool({
    EPER_PAYMENT_DATABASE_URL: TEST_URL, EPER_PG_POOL_MAX: "lots",
  }), /EPER_PG_POOL_MAX_INVALID/);
});
