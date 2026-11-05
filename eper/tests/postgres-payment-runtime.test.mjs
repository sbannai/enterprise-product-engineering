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


const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL pool preserves callback and Promise acquisition used by Pool.query", {
  skip: !databaseConfigured,
  timeout: 10_000,
}, async () => {
  const pool = createPostgresPaymentPool();
  try {
    // node-postgres Pool.query() uses the callback overload of Pool.connect() internally.
    const queryResult = await pool.query("SELECT 1 AS value");
    assert.equal(queryResult.rows[0]?.value, 1);

    const client = await new Promise((resolve, reject) => {
      pool.connect((error, acquiredClient) => {
        if (error) reject(error);
        else if (!acquiredClient) reject(new Error("POSTGRES_POOL_CALLBACK_CLIENT_REQUIRED"));
        else resolve(acquiredClient);
      });
    });
    try {
      const callbackResult = await client.query("SELECT 2 AS value");
      assert.equal(callbackResult.rows[0]?.value, 2);
    } finally {
      client.release();
    }

    const promiseClient = await pool.connect();
    try {
      const promiseResult = await promiseClient.query("SELECT 3 AS value");
      assert.equal(promiseResult.rows[0]?.value, 3);
    } finally {
      promiseClient.release();
    }

    const metrics = pool.snapshotMetrics();
    assert.equal(metrics.connectAttempts, 3);
    assert.equal(metrics.connectFailures, 0);
    assert.equal(metrics.inFlightAcquisitions, 0);
    assert.equal(metrics.totalCount >= 1, true);
    assert.equal(metrics.acquisitionDurationTotalMs > 0, true);
    assert.equal(metrics.acquisitionDurationMaxMs > 0, true);
  } finally {
    await pool.end();
  }
});

test("PostgreSQL pool exposes only aggregate acquisition and pool counters", async () => {
  const pool = createPostgresPaymentPool({ EPER_PAYMENT_DATABASE_URL: TEST_URL });
  try {
    const metrics = pool.snapshotMetrics();
    assert.deepEqual(Object.keys(metrics).sort(), [
      "acquisitionDurationMaxMs",
      "acquisitionDurationTotalMs",
      "connectAttempts",
      "connectFailures",
      "idleCount",
      "inFlightAcquisitions",
      "totalCount",
      "waitingCount",
    ].sort());
    assert.equal(metrics.totalCount, 0);
    assert.equal(metrics.idleCount, 0);
    assert.equal(metrics.waitingCount, 0);
    assert.equal(metrics.connectAttempts, 0);
    assert.equal(metrics.connectFailures, 0);
    assert.equal(metrics.inFlightAcquisitions, 0);
    assert.equal(metrics.acquisitionDurationTotalMs, 0);
    assert.equal(metrics.acquisitionDurationMaxMs, 0);
    assert.equal(JSON.stringify(metrics).includes("password"), false);
  } finally {
    await pool.end();
  }
});
