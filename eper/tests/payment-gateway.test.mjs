import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../dist/apps/api/server.js";

test("Razorpay payment routes fail closed on bad signatures and scope receipts by tenant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eper-payment-test-"));
  const envKeys = [
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "EPER_PAYMENT_API_TOKEN", "EPER_PAYMENT_LEDGER_FILE",
    "EPER_PAYMENT_ALLOW_CLIENT_AMOUNT", "NODE_ENV",
  ];
  const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const nativeFetch = globalThis.fetch;
  const secret = "razorpay-test-secret";
  const token = "t".repeat(40);
  let nextPayment = {
    id: "pay_test_001",
    order_id: "order_test_001",
    amount: 12500,
    currency: "INR",
    status: "captured",
  };

  Object.assign(process.env, {
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: secret,
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    EPER_PAYMENT_API_TOKEN: token,
    EPER_PAYMENT_LEDGER_FILE: join(dir, "payments.json"),
    EPER_PAYMENT_ALLOW_CLIENT_AMOUNT: "true",
    NODE_ENV: "test",
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.razorpay.com/v1/orders") {
      return new Response(JSON.stringify({ id: "order_test_001" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.razorpay.com/v1/payments/pay_test_001") {
      return new Response(JSON.stringify(nextPayment), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return nativeFetch(input, init);
  };

  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant-a",
      "content-type": "application/json",
    };

    const created = await nativeFetch(`${base}/api/payments/orders`, {
      method: "POST", headers,
      body: JSON.stringify({
        tenantId: "tenant-a", reference: "invoice-001",
        amountPaise: 12500, currency: "INR",
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.payment.razorpayOrderId, "order_test_001");

    const badSignature = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: "order_test_001",
        razorpay_payment_id: "pay_test_001",
        razorpay_signature: "not-a-signature",
      }),
    });
    assert.equal(badSignature.status, 400);

    const signature = createHmac("sha256", secret)
      .update("order_test_001|pay_test_001").digest("hex");
    const verified = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: "order_test_001",
        razorpay_payment_id: "pay_test_001",
        razorpay_signature: signature,
      }),
    });
    assert.equal(verified.status, 200);
    const verifiedBody = await verified.json();
    assert.match(verifiedBody.receiptUrl, /^\/api\/payments\/.+\/receipt\.pdf$/);

    const receipt = await nativeFetch(base + verifiedBody.receiptUrl, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-a" },
    });
    assert.equal(receipt.status, 200);
    assert.match(receipt.headers.get("content-type") ?? "", /application\/pdf/);
    assert.ok((await receipt.arrayBuffer()).byteLength > 100);

    const crossTenantReceipt = await nativeFetch(base + verifiedBody.receiptUrl, {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-b" },
    });
    assert.equal(crossTenantReceipt.status, 403);

    const badWebhook = await nativeFetch(`${base}/api/payments/webhooks/razorpay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": "bad" },
      body: JSON.stringify({ event: "payment.captured" }),
    });
    assert.equal(badWebhook.status, 401);

    nextPayment = { ...nextPayment, amount: 99999 };
    const mismatchedAmount = await nativeFetch(`${base}/api/payments/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        razorpay_order_id: "order_test_001",
        razorpay_payment_id: "pay_test_001",
        razorpay_signature: signature,
      }),
    });
    assert.equal(mismatchedAmount.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = nativeFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
});
