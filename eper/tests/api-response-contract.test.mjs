import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { sendApiSuccess, sendApiError, resolveApiRequestId } from "../dist/apps/api/api-response.js";

test("API success envelope standardizes headers and request correlation", async () => {
  const server = createServer((request, response) => sendApiSuccess(request, response, 200, { items: [1, 2] }));
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port, { headers: { "x-correlation-id": "contract-test-123" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", new RegExp("application/json; charset=utf-8"));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-request-id"), "contract-test-123");
    assert.deepEqual(await response.json(), { success: true, data: { items: [1, 2] }, meta: { requestId: "contract-test-123" } });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("API error envelope is stable and omits absent details", async () => {
  const server = createServer((request, response) => sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."));
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port);
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.success, false);
    assert.deepEqual(payload.error, { code: "UNAUTHENTICATED", message: "Authentication is required." });
    assert.equal(payload.meta.requestId, response.headers.get("x-request-id"));
    assert.ok(typeof payload.meta.requestId === "string" && payload.meta.requestId.length > 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("request ID rejects unsafe caller values and generates a replacement", () => {
  assert.equal(resolveApiRequestId({ headers: { "x-correlation-id": "safe.id-123" } }), "safe.id-123");
  const generated = resolveApiRequestId({ headers: { "x-correlation-id": "bad value" } });
  assert.match(generated, /^[0-9a-f-]{36}$/i);
});
