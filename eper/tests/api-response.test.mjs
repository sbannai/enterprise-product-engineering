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

test("throwing error-detail array proxies cannot abort response generation", () => {
  const details = new Proxy([], {
    get(target, property, receiver) {
      if (property === "length" || property === "slice") throw new Error("untrusted proxy");
      return Reflect.get(target, property, receiver);
    },
  });
  const res = responseRecorder();

  assert.doesNotThrow(() => sendApiError(request(), res, 400, "INVALID_INPUT", "Invalid input.", details));
  assert.equal(res.json().success, false);
  assert.equal(res.json().error.code, "INVALID_INPUT");
});

test("error detail objects with throwing property getters are normalized safely", () => {
  const malformed = Object.defineProperties({}, {
    field: { enumerable: true, get() { throw new Error("untrusted getter"); } },
    code: { enumerable: true, get() { throw new Error("untrusted getter"); } },
  });
  const res = responseRecorder();

  assert.doesNotThrow(() => sendApiError(request(), res, 400, "INVALID_INPUT", "Invalid input.", [malformed]));
  assert.deepEqual(res.json().error.details, [{ field: "unknown", code: "INVALID_DETAIL" }]);
});

test("error messages fall back safely for blank and non-string runtime values", () => {
  for (const message of ["   ", null, 17, {}]) {
    const res = responseRecorder();
    sendApiError(request(), res, 400, "INVALID_INPUT", message);
    assert.equal(res.json().error.message, "The request could not be completed.");
  }
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

test("request ID generation survives throwing header accessors", () => {
  const req = Object.defineProperty({}, "headers", {
    get() { throw new Error("untrusted header accessor"); },
  });
  const resolved = resolveApiRequestId(req);
  assert.match(resolved, /^[0-9a-f-]{36}$/i);
  assert.equal(resolveApiRequestId(req), resolved);
});

test("invalid correlation IDs are replaced with safe generated request IDs", () => {
  const resolved = resolveApiRequestId(request({ "x-correlation-id": "bad correlation id" }));
  assert.match(resolved, /^[0-9a-f-]{36}$/i);

  const res = responseRecorder();
  sendApiSuccess(request({ "x-correlation-id": "bad correlation id" }), res, 200, { ok: true });
  assert.equal(res.headers.get("x-request-id"), res.json().meta.requestId);
  assert.match(res.headers.get("x-request-id"), /^[0-9a-f-]{36}$/i);
});

test("success and error helpers reuse one request correlation ID", () => {
  const req = request({ "x-correlation-id": "shared-request-42" });
  const success = responseRecorder();
  const failure = responseRecorder();

  sendApiSuccess(req, success, 200, { ok: true });
  sendApiError(req, failure, 409, "STATE_CONFLICT", "The operation conflicts with current state.");

  assert.equal(success.headers.get("x-request-id"), "shared-request-42");
  assert.equal(failure.headers.get("x-request-id"), "shared-request-42");
  assert.equal(success.json().meta.requestId, failure.json().meta.requestId);
});

test("array and oversized correlation headers are replaced with generated IDs", () => {
  const headers = [
    { "x-correlation-id": ["first", "second"] },
    { "x-correlation-id": "x".repeat(129) },
  ];

  for (const requestHeaders of headers) {
    const req = request(requestHeaders);
    const resolved = resolveApiRequestId(req);
    assert.match(resolved, /^[0-9a-f-]{36}$/i);
    assert.equal(resolveApiRequestId(req), resolved);
  }
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

test("throwing toJSON methods fail before mutating the response", () => {
  const data = { toJSON() { throw new Error("serialization denied"); } };
  const res = responseRecorder();

  assert.throws(() => sendApiSuccess(request(), res, 200, data), /serialization denied/);
  assert.equal(res.ended, false);
  assert.equal(res.headers.size, 0);
  assert.equal(res.statusCode, undefined);
});

test("BigInt success payloads fail before mutating the response", () => {
  const res = responseRecorder();
  assert.throws(() => sendApiSuccess(request(), res, 200, { amount: 1n }), /BigInt|serialize/i);
  assert.equal(res.ended, false);
  assert.equal(res.headers.size, 0);
  assert.equal(res.statusCode, undefined);
});

test("circular success payloads fail before mutating the response", () => {
  const data = {};
  data.self = data;
  const res = responseRecorder();

  assert.throws(() => sendApiSuccess(request(), res, 200, data), /circular|cyclic/i);
  assert.equal(res.ended, false);
  assert.equal(res.headers.size, 0);
  assert.equal(res.statusCode, undefined);
});

test("success responses reject malformed runtime data before writing headers or a body", () => {
  for (const data of [null, undefined, [], "unexpected", 42]) {
    const res = responseRecorder();
    assert.throws(() => sendApiSuccess(request(), res, 200, data), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
    assert.equal(res.ended, false);
    assert.equal(res.headers.size, 0);
  }
});

test("success responses reject non-integer and non-finite status codes", () => {
  for (const statusCode of [NaN, Infinity, 200.5, "200", null]) {
    const res = responseRecorder();
    assert.throws(() => sendApiSuccess(request(), res, statusCode, {}), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
    assert.equal(res.ended, false);
    assert.equal(res.headers.size, 0);
  }
});

test("error responses reject non-integer and non-finite status codes", () => {
  for (const statusCode of [NaN, Infinity, 400.5, "400", null]) {
    const res = responseRecorder();
    assert.throws(() => sendApiError(request(), res, statusCode, "INVALID_INPUT", "Invalid input."), /API_ERROR_STATUS_INVALID/);
    assert.equal(res.ended, false);
    assert.equal(res.headers.size, 0);
  }
});

test("success responses reject non-success status codes and invalid no-content bodies", () => {
  assert.throws(() => sendApiSuccess(request(), responseRecorder(), 400, {}), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
  assert.throws(() => sendApiSuccess(request(), responseRecorder(), 204, { unexpected: true }), /API_SUCCESS_STATUS_OR_BODY_INVALID/);
});
