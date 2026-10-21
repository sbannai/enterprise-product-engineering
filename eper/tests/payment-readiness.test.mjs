import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

async function withServer(server, run) {
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("payment readiness lists missing prerequisites without exposing configuration", async () => {
  const keys = ["EPER_PAYMENT_PERSISTENCE", "NODE_ENV", "EPER_INVOICE_AUTHORITY_TOKEN", "EPER_BUILD_ID"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_PAYMENT_PERSISTENCE: "json-file",
    NODE_ENV: "test",
    EPER_INVOICE_AUTHORITY_TOKEN: "never-echo-this-secret-value",
    EPER_BUILD_ID: "0123456789abcdef0123456789abcdef01234567",
  });
  try {
    await withServer(createAppServer(), async (base) => {
      const response = await fetch(`${base}/readyz/payments`);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      assert.equal(body.status, "blocked");
      assert.equal(body.subsystem, "payments");
      assert.deepEqual(body.blockers, [
        "durable_postgres_payment_store_unavailable",
        "trusted_invoice_authority_unavailable",
        "receipt_numbering_policy_unconfigured",
      ]);
      assert.equal(JSON.stringify(body).includes("never-echo-this-secret-value"), false);
      // Overall API health is independent from the blocked payment subsystem.
      const health = await fetch(`${base}/health`);
      assert.equal(health.status, 200);
      assert.equal((await health.json()).status, "ok");
    });
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});

test("payment readiness keeps production payment enablement blocked pending authorized review", async () => {
  const keys = ["EPER_PAYMENT_PERSISTENCE", "NODE_ENV"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { EPER_PAYMENT_PERSISTENCE: "postgres", NODE_ENV: "production" });
  try {
    await withServer(createAppServer({
      paymentStore: { async checkConnectivity() { return true; } },
      invoiceAmountSource: { async findInvoice() { return null; } },
      receiptNumberSource: async () => "TEST-RECEIPT",
    }), async (base) => {
      const response = await fetch(`${base}/readyz/payments`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.status, "blocked");
      assert.deepEqual(body.blockers, [
        "production_payment_enablement_requires_authorized_readiness_review",
      ]);
    });
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});

test("payment readiness fails closed when PostgreSQL connectivity probe fails", async () => {
  const keys = ["EPER_PAYMENT_PERSISTENCE", "NODE_ENV"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { EPER_PAYMENT_PERSISTENCE: "postgres", NODE_ENV: "test" });
  try {
    await withServer(createAppServer({
      paymentStore: { async checkConnectivity() { throw new Error("database connection failed"); } },
      invoiceAmountSource: {},
      receiptNumberSource: async () => "TEST-RECEIPT",
    }), async (base) => {
      const response = await fetch(`${base}/readyz/payments`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.status, "blocked");
      assert.deepEqual(body.blockers, ["postgres_payment_database_unreachable"]);
    });
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});

test("payment readiness rejects present-but-invalid invoice and receipt adapters", async () => {
  const keys = ["EPER_PAYMENT_PERSISTENCE", "NODE_ENV"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { EPER_PAYMENT_PERSISTENCE: "postgres", NODE_ENV: "test" });
  try {
    await withServer(createAppServer({
      paymentStore: { async checkConnectivity() { return true; } },
      invoiceAmountSource: {},
      receiptNumberSource: {},
    }), async (base) => {
      const response = await fetch(`${base}/readyz/payments`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.status, "blocked");
      assert.deepEqual(body.blockers, [
        "trusted_invoice_authority_unavailable",
        "receipt_numbering_policy_unconfigured",
      ]);
    });
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});

test("payment readiness reports configured when PostgreSQL is reachable outside production", async () => {
  const keys = ["EPER_PAYMENT_PERSISTENCE", "NODE_ENV"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { EPER_PAYMENT_PERSISTENCE: "postgres", NODE_ENV: "test" });
  try {
    await withServer(createAppServer({
      paymentStore: { async checkConnectivity() { return true; } },
      invoiceAmountSource: {},
      receiptNumberSource: async () => "TEST-RECEIPT",
    }), async (base) => {
      const response = await fetch(`${base}/readyz/payments`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.status, "ready");
      assert.deepEqual(body.blockers, []);
    });
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});
