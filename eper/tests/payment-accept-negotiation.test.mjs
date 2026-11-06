import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handlePaymentRoute } from "../dist/apps/api/payments.js";

async function requestWithAccept(accept) {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const server = createServer((request, response) => {
    void handlePaymentRoute(request, response, new URL(request.url ?? "/", "http://localhost").pathname);
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const headers = accept === undefined ? {} : { accept };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/payments/orders`, { headers });
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

test("payment routes do not negotiate v1 when its Accept quality is zero", async () => {
  for (const accept of [
    "application/vnd.eper.v1+json;q=0",
    "application/vnd.eper.v1+json; charset=utf-8; q=0.000",
    "application/vnd.eper.v1+json;q=0, application/json;q=1",
  ]) {
    const response = await requestWithAccept(accept);
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "payment_persistence_not_production_ready" }, accept);
  }
});

test("payment routes negotiate v1 when its Accept quality is positive or omitted", async () => {
  for (const accept of [
    "application/vnd.eper.v1+json",
    "application/vnd.eper.v1+json;q=0.5",
    "application/vnd.eper.v1+json;Q=1.000",
  ]) {
    const response = await requestWithAccept(accept);
    assert.equal(response.status, 503);
    assert.equal(response.body.success, false, accept);
    assert.equal(response.body.error.code, "PAYMENT_PERSISTENCE_NOT_PRODUCTION_READY", accept);
  }
});

test("payment routes retain legacy responses when v1 is not accepted", async () => {
  const response = await requestWithAccept("application/json");
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: "payment_persistence_not_production_ready" });
});
