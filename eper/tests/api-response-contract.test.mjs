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
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-type") ?? "", /application\/json; charset=utf-8/);
    assert.equal(payload.success, false);
    assert.deepEqual(payload.error, { code: "UNAUTHENTICATED", message: "Authentication is required." });
    assert.equal(payload.meta.requestId, response.headers.get("x-request-id"));
    assert.ok(typeof payload.meta.requestId === "string" && payload.meta.requestId.length > 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("API envelope uses the same generated ID in header and metadata for unsafe correlation input", async () => {
  const server = createServer((request, response) => sendApiError(request, response, 400, "INVALID_REQUEST", "Invalid request."));
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port, { headers: { "x-correlation-id": "unsafe value" } });
    const payload = await response.json();
    const headerId = response.headers.get("x-request-id");
    assert.match(headerId ?? "", /^[0-9a-f-]{36}$/i);
    assert.equal(payload.meta.requestId, headerId);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("request ID rejects unsafe caller values and generates a replacement", () => {
  assert.equal(resolveApiRequestId({ headers: { "x-correlation-id": "safe.id-123" } }), "safe.id-123");
  const request = { headers: { "x-correlation-id": "bad value" } };
  const generated = resolveApiRequestId(request);
  assert.match(generated, /^[0-9a-f-]{36}$/i);
  assert.equal(resolveApiRequestId(request), generated, "generated request ID must remain stable for this request");
  assert.notEqual(resolveApiRequestId({ headers: { "x-correlation-id": "bad value" } }), generated, "separate requests must not share generated IDs");
});


test("request ID enforces the maximum accepted correlation ID length", () => {
  const accepted = "a".repeat(128);
  assert.equal(resolveApiRequestId({ headers: { "x-correlation-id": accepted } }), accepted);
  const overLimit = resolveApiRequestId({ headers: { "x-correlation-id": "a".repeat(129) } });
  assert.match(overLimit, /^[0-9a-f-]{36}$/i);
  assert.notEqual(overLimit, "a".repeat(129));
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

test("API error details are bounded and machine-readable", async () => {
  const server = createServer((request, response) => sendApiError(
    request, response, 422, "VALIDATION_FAILED", "   ",
    [{ field: "x".repeat(200), code: "INVALID_FIELD" }, { field: "amount", code: "bad code" }, ...Array.from({ length: 60 }, (_, index) => ({ field: "field" + index, code: "INVALID_FIELD" }))],
  ));
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port);
    const payload = await response.json();
    assert.equal(response.status, 422);
    assert.equal(payload.error.message, "The request could not be completed.");
    assert.deepEqual(payload.error.details.slice(0, 2), [
      { field: "x".repeat(128), code: "INVALID_FIELD" },
      { field: "amount", code: "INVALID_DETAIL" },
    ]);
    assert.equal(payload.error.details.length, 50, "error details must be capped to prevent oversized envelopes");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("API success helper rejects a 205 response with content", () => {
  assert.throws(() => sendApiSuccess({ headers: {} }, {}, 205, { changed: true }), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
});
