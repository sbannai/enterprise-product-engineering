import test from "node:test";
import assert from "node:assert/strict";
import { sendApiError, sendApiSuccess, resolveApiRequestId } from "../dist/apps/api/api-response.js";

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    statusCode: undefined,
    body: undefined,
    ended: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    writeHead(statusCode) { this.statusCode = statusCode; },
    end(body) { this.body = body; this.ended = true; },
    json() { return this.body ? JSON.parse(this.body) : undefined; },
  };
}

function request(headers = {}) {
  return { headers };
}

test("versioned success envelope standardizes body, request id, and secure headers", () => {
  const req = request({ "x-correlation-id": "response-contract-test-1" });
  const res = responseRecorder();
  sendApiSuccess(req, res, 200, { tickets: [], limit: 25, offset: 0 });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    success: true,
    data: { tickets: [], limit: 25, offset: 0 },
    meta: { requestId: "response-contract-test-1" },
  });
  assert.equal(res.headers.get("x-request-id"), "response-contract-test-1");
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("versioned error envelope normalizes details and never accepts an invalid error code", () => {
  const res = responseRecorder();
  sendApiError(request({ "x-correlation-id": "response-contract-test-2" }), res, 400,
    "INVALID_TICKET_INPUT", "Ticket input is invalid.", [
      { field: "title", code: "REQUIRED" },
      { field: "description", code: "contains spaces" },
    ]);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), {
    success: false,
    error: {
      code: "INVALID_TICKET_INPUT",
      message: "Ticket input is invalid.",
      details: [
        { field: "title", code: "REQUIRED" },
        { field: "description", code: "INVALID_DETAIL" },
      ],
    },
    meta: { requestId: "response-contract-test-2" },
  });
  assert.equal(res.headers.get("x-request-id"), "response-contract-test-2");
  assert.throws(() => sendApiError(request(), responseRecorder(), 400, "invalid-code", "bad"), /API_ERROR_CODE_INVALID/);
  assert.throws(() => sendApiError(request(), responseRecorder(), 200, "INVALID", "bad"), /API_ERROR_STATUS_INVALID/);
});

test("error responses bound messages and tolerate malformed detail entries", () => {
  const res = responseRecorder();
  sendApiError(request(), res, 400, "INVALID_INPUT", "x".repeat(900), [
    null,
    { field: 17, code: 3 },
    { field: "f".repeat(200), code: "REQUIRED" },
  ]);
  const body = res.json();
  assert.equal(body.error.message.length, 500);
  assert.deepEqual(body.error.details, [
    { field: "unknown", code: "INVALID_DETAIL" },
    { field: "unknown", code: "INVALID_DETAIL" },
    { field: "f".repeat(128), code: "REQUIRED" },
  ]);
});

test("error response detail count is capped at fifty entries", () => {
  const res = responseRecorder();
  const details = Array.from({ length: 75 }, (_, index) => ({ field: "field" + index, code: "REQUIRED" }));
  sendApiError(request(), res, 400, "INVALID_INPUT", "Invalid input.", details);
  const body = res.json();
  assert.equal(body.error.details.length, 50);
  assert.equal(body.error.details[0].field, "field0");
  assert.equal(body.error.details[49].field, "field49");
});

test("malformed runtime error codes are rejected without serializing a response", () => {
  for (const code of [null, 17, {}, "A", "lower_case", "X".repeat(65)]) {
    const res = responseRecorder();
    assert.throws(() => sendApiError(request(), res, 400, code, "Invalid input."));
    assert.equal(res.ended, false);
  }
});

test("invalid correlation IDs are replaced with safe generated request IDs", () => {
  const resolved = resolveApiRequestId(request({ "x-correlation-id": "bad correlation id" }));
  assert.match(resolved, /^[0-9a-f-]{36}$/i);

  const res = responseRecorder();
  sendApiSuccess(request({ "x-correlation-id": "bad correlation id" }), res, 200, { ok: true });
  assert.equal(res.headers.get("x-request-id"), res.json().meta.requestId);
  assert.match(res.headers.get("x-request-id"), /^[0-9a-f-]{36}$/i);
});

test("204 and 205 success responses remain bodyless while retaining request correlation", () => {
  for (const statusCode of [204, 205]) {
    const res = responseRecorder();
    sendApiSuccess(request({ "x-correlation-id": "no-content-" + statusCode }), res, statusCode, {});
    assert.equal(res.statusCode, statusCode);
    assert.equal(res.body, undefined);
    assert.equal(res.headers.get("x-request-id"), "no-content-" + statusCode);
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
});

test("success responses reject non-success status codes and invalid no-content bodies", () => {
  assert.throws(() => sendApiSuccess(request(), responseRecorder(), 400, {}), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
  assert.throws(() => sendApiSuccess(request(), responseRecorder(), 204, { unexpected: true }), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
});
