// Exact-head regression rerun after payment/receipt branch ancestry reconciliation.
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
        "trusted_transaction_authority_unavailable",
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

test("payment readiness rejects invoice sources without a callable lookup method", async () => {
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
      assert.equal(response.status, 503);
      assert.deepEqual((await response.json()).blockers, ["trusted_invoice_authority_unavailable", "trusted_transaction_authority_unavailable"]);
    });
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});

test("payment readiness rejects non-callable receipt numbering source", async () => {
  const keys = ["EPER_PAYMENT_PERSISTENCE", "NODE_ENV"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { EPER_PAYMENT_PERSISTENCE: "postgres", NODE_ENV: "test" });
  try {
    await withServer(createAppServer({
      paymentStore: { async checkConnectivity() { return true; } },
      invoiceAmountSource: { async findInvoice() { return null; } },
      receiptNumberSource: {},
    }), async (base) => {
      const response = await fetch(`${base}/readyz/payments`);
      assert.equal(response.status, 503);
      assert.deepEqual((await response.json()).blockers, ["receipt_numbering_policy_unconfigured", "trusted_transaction_authority_unavailable"]);
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
        "trusted_transaction_authority_unavailable",
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
      invoiceAmountSource: { async findInvoice() { return null; } },
      receiptNumberSource: async () => "TEST-RECEIPT",
    }), async (base) => {
      const response = await fetch(`${base}/readyz/payments`);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.status, "blocked");
      assert.deepEqual(body.blockers, ["postgres_payment_database_unreachable", "trusted_transaction_authority_unavailable"]);
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
        "trusted_transaction_authority_unavailable",
      ]);
    });
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});

test("payment readiness reports configured when PostgreSQL and gateway are ready outside production", async () => {
  const keys = ["EPER_PAYMENT_PERSISTENCE", "NODE_ENV", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_PAYMENT_PERSISTENCE: "postgres", NODE_ENV: "test",
    RAZORPAY_KEY_ID: "rzp_test_id", RAZORPAY_KEY_SECRET: "test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-secret", EPER_PAYMENT_API_TOKEN: "x".repeat(40),
    EPER_PAYMENT_TENANT_TOKENS: JSON.stringify({ "tenant-a": "tenant-specific-secret".padEnd(40, "y") }),
  });
  try {
    await withServer(createAppServer({
      paymentStore: { async checkConnectivity() { return true; } },
      invoiceAmountSource: { async findInvoice() { return null; } },
      receiptNumberSource: async () => "TEST-RECEIPT",
      transactionSnapshotSource: { async findTransaction() { return null; } },
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


test("payment readiness blocks missing or shared tenant credentials even when other prerequisites pass", async () => {
  const keys = ["EPER_PAYMENT_PERSISTENCE", "NODE_ENV", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_TENANT_TOKENS"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_PAYMENT_PERSISTENCE: "postgres", NODE_ENV: "test",
    RAZORPAY_KEY_ID: "rzp_test_id", RAZORPAY_KEY_SECRET: "test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-secret", EPER_PAYMENT_API_TOKEN: "shared-api-token".padEnd(40, "z"),
  });
  const serverOptions = {
    paymentStore: { async checkConnectivity() { return true; } },
    invoiceAmountSource: { async findInvoice() { return null; } },
    receiptNumberSource: async () => "TEST-RECEIPT",
    transactionSnapshotSource: { async findTransaction() { return null; } },
  };
  try {
    for (const mapping of [undefined, JSON.stringify({ "tenant-a": process.env.EPER_PAYMENT_API_TOKEN })]) {
      if (mapping === undefined) delete process.env.EPER_PAYMENT_TENANT_TOKENS;
      else process.env.EPER_PAYMENT_TENANT_TOKENS = mapping;
      await withServer(createAppServer(serverOptions), async (base) => {
        const response = await fetch(`${base}/readyz/payments`);
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.equal(body.status, "blocked");
        assert.deepEqual(body.blockers, ["tenant_identity_unconfigured"]);
      });
    }
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});


for (const persistence of [undefined, "json-file"]) {
  test(`payment routes fail closed outside tests when persistence is ${persistence ?? "unset"}`, async () => {
    const keys = ["NODE_ENV", "EPER_PAYMENT_PERSISTENCE"];
    const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.NODE_ENV = "development";
    if (persistence === undefined) delete process.env.EPER_PAYMENT_PERSISTENCE;
    else process.env.EPER_PAYMENT_PERSISTENCE = persistence;
    try {
      await withServer(createAppServer(), async (base) => {
        const requests = [
          fetch(`${base}/api/payments/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
          fetch(`${base}/api/payments/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
          fetch(`${base}/api/payments/webhooks/razorpay`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
          fetch(`${base}/api/payments/receipts/00000000-0000-4000-8000-000000000000.pdf`),
          fetch(`${base}/api/payments/00000000-0000-4000-8000-000000000000/receipt.pdf`),
        ];
        for (const response of await Promise.all(requests)) {
          assert.equal(response.status, 503);
          assert.deepEqual(await response.json(), { error: "payment_persistence_mode_not_allowed" });
        }
      });
    } finally {
      for (const key of keys) {
        if (prior[key] === undefined) delete process.env[key];
        else process.env[key] = prior[key];
      }
    }
  });
}


for (const persistence of [undefined, "json-file"]) {
  test(`environment variables alone cannot enable legacy payment persistence (${persistence ?? "unset"})`, async () => {
    const keys = ["NODE_ENV", "NODE_TEST_CONTEXT", "EPER_PAYMENT_PERSISTENCE"];
    const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.NODE_ENV = "test";
    process.env.NODE_TEST_CONTEXT = "spoofed-test-context";
    if (persistence === undefined) delete process.env.EPER_PAYMENT_PERSISTENCE;
    else process.env.EPER_PAYMENT_PERSISTENCE = persistence;
    try {
      await withServer(createAppServer(), async (base) => {
        const requests = [
          fetch(`${base}/api/payments/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
          fetch(`${base}/api/payments/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
          fetch(`${base}/api/payments/webhooks/razorpay`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
          fetch(`${base}/api/payments/receipts/00000000-0000-4000-8000-000000000000.pdf`),
          fetch(`${base}/api/payments/00000000-0000-4000-8000-000000000000/receipt.pdf`),
        ];
        for (const response of await Promise.all(requests)) {
          assert.equal(response.status, 503);
          assert.deepEqual(await response.json(), { error: "payment_persistence_mode_not_allowed" });
        }
      });
    } finally {
      for (const key of keys) {
        if (prior[key] === undefined) delete process.env[key];
        else process.env[key] = prior[key];
      }
    }
  });
}
