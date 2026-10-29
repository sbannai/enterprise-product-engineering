import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { sendApiSuccess, sendApiError, sendApiLegacyJson, resolveApiRequestId } from "../dist/apps/api/api-response.js";

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


test("API 204 success has no body while retaining standard headers", async () => {
  const server = createServer((request, response) => sendApiSuccess(request, response, 204, {}));
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("x-request-id")?.length > 0, true);
    assert.equal(await response.text(), "");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("API error helper rejects invalid HTTP status and machine code", () => {
  const request = { headers: {} };
  const response = {};
  assert.throws(() => sendApiError(request, response, 200, "BAD_REQUEST", "Invalid."), /API_ERROR_STATUS_INVALID/);
  assert.throws(() => sendApiError(request, response, 400, "bad request", "Invalid."), /API_ERROR_CODE_INVALID/);
  assert.throws(() => sendApiSuccess(request, response, 302, {}), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
});


test("API 205 success has no body and rejects payload data", async () => {
  const server = createServer((request, response) => sendApiSuccess(request, response, 205, {}));
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port);
    assert.equal(response.status, 205);
    assert.equal(response.headers.get("x-request-id")?.length > 0, true);
    assert.equal(await response.text(), "");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("API success helper rejects a 205 response with content", () => {
  assert.throws(() => sendApiSuccess({ headers: {} }, {}, 205, { changed: true }), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
});


test("legacy JSON writer preserves ordinary payloads and suppresses 204/205 bodies", async () => {
  const server = createServer((request, response) => {
    const status = Number(new URL(request.url ?? "/", "http://localhost").pathname.slice(1));
    sendApiLegacyJson(request, response, status, { legacy: true });
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    const legacy = await fetch(base + "/200", { headers: { "x-correlation-id": "legacy-body-test" } });
    assert.equal(legacy.status, 200);
    assert.deepEqual(await legacy.json(), { legacy: true });
    assert.equal(legacy.headers.get("x-request-id"), "legacy-body-test");

    for (const status of [204, 205]) {
      const response = await fetch(base + "/" + status);
      assert.equal(response.status, status);
      assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-request-id")?.length > 0, true);
      assert.equal(await response.text(), "");
    }

    const notModified = await new Promise((resolve, reject) => {
      const request = httpRequest(base + "/304", { method: "GET" }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString(),
        }));
      });
      request.on("error", reject);
      request.end();
    });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(notModified.headers["cache-control"], "no-store");
    assert.equal(notModified.headers["x-content-type-options"], "nosniff");
    assert.equal(typeof notModified.headers["x-request-id"], "string");
    assert.equal(notModified.body, "");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
