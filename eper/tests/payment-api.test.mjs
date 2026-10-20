import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "local-sandbox-token-with-at-least-32-characters";

test("sandbox payment HTTP flow requires auth and downloads receipt only after success", async () => {
  const envKeys = [
    "EPER_PAYMENT_SANDBOX_ENABLED", "EPER_PAYMENT_SANDBOX_TOKEN",
    "EPER_PAYMENT_SANDBOX_TENANT_ID", "EPER_PAYMENT_SANDBOX_PRINCIPAL_ID",
  ];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_PAYMENT_SANDBOX_ENABLED: "true",
    EPER_PAYMENT_SANDBOX_TOKEN: TOKEN,
    EPER_PAYMENT_SANDBOX_TENANT_ID: "uat-tenant-a",
    EPER_PAYMENT_SANDBOX_PRINCIPAL_ID: "uat-tester-a",
  });

  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const auth = { authorization: `Bearer ${TOKEN}` };

    const unauthorized = await fetch(`${base}/sandbox/payments`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountPaise: 12550, description: "test fee", idempotencyKey: "http-test-1" }),
    });
    assert.equal(unauthorized.status, 401);

    const createdResponse = await fetch(`${base}/sandbox/payments`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", "idempotency-key": "http-test-1" },
      body: JSON.stringify({ amountPaise: 12550, description: "test fee" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    const paymentId = created.payment.id;
    assert.equal(created.payment.status, "PENDING");

    const prematureReceipt = await fetch(`${base}/sandbox/payments/${paymentId}/receipt`, { headers: auth });
    assert.equal(prematureReceipt.status, 409);

    const callback = await fetch(`${base}/sandbox/payments/${paymentId}/result`, {
      method: "POST", headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ outcome: "SUCCEEDED", providerReference: "sandbox-http-txn-1" }),
    });
    assert.equal(callback.status, 200);
    assert.equal((await callback.json()).payment.status, "SUCCEEDED");

    const receiptResponse = await fetch(`${base}/sandbox/payments/${paymentId}/receipt`, { headers: auth });
    assert.equal(receiptResponse.status, 200);
    assert.match(receiptResponse.headers.get("content-type") ?? "", /application\/pdf/);
    assert.match(Buffer.from(await receiptResponse.arrayBuffer()).toString("ascii", 0, 8), /%PDF-1\.4/);

    const replayResponse = await fetch(`${base}/sandbox/payments`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", "idempotency-key": "http-test-1" },
      body: JSON.stringify({ amountPaise: 12550, description: "test fee" }),
    });
    assert.equal(replayResponse.status, 200);
    assert.equal((await replayResponse.json()).payment.id, paymentId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
