import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiErrorDetail { field: string; code: string; }

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const requestIds = new WeakMap<IncomingMessage, string>();

export function resolveApiRequestId(request: IncomingMessage): string {
  const existing = requestIds.get(request);
  if (existing) return existing;
  const supplied = request.headers["x-correlation-id"];
  const requestId = typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
  requestIds.set(request, requestId);
  return requestId;
}

function writeEnvelope(response: ServerResponse, statusCode: number, body: Record<string, unknown>, requestId: string): void {
  // Serialize before mutating the response so circular or otherwise unserializable
  // payloads cannot leave partially written headers behind.
  const serializedBody = statusCode === 204 || statusCode === 205 ? undefined : JSON.stringify(body);
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-request-id", requestId);
  if (statusCode === 204 || statusCode === 205) {
    response.statusCode = statusCode;
    response.end();
    return;
  }
  response.writeHead(statusCode);
  response.end(serializedBody);
}

export function sendApiSuccess(request: IncomingMessage, response: ServerResponse, statusCode: number, data: Record<string, unknown>): void {
  if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode >= 300 || data === null || typeof data !== "object" || Array.isArray(data) || (statusCode === 204 || statusCode === 205) && Object.keys(data).length > 0) {
    throw new TypeError("API_SUCCESS_STATUS_OR_BODY_INVALID");
  }
  const requestId = resolveApiRequestId(request);
  writeEnvelope(response, statusCode, { success: true, data, meta: { requestId } }, requestId);
}

export function sendApiError(request: IncomingMessage, response: ServerResponse, statusCode: number, code: string, message: string, details?: ApiErrorDetail[]): void {
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    throw new TypeError("API_ERROR_STATUS_INVALID");
  }
  if (typeof code !== "string" || !ERROR_CODE_PATTERN.test(code)) {
    throw new TypeError("API_ERROR_CODE_INVALID");
  }
  const requestId = resolveApiRequestId(request);
  const safeMessage = typeof message === "string" ? message.trim().slice(0, 500) : "";
  const error: Record<string, unknown> = { code, message: safeMessage || "The request could not be completed." };
  if (Array.isArray(details) && details.length) {
    error.details = details.slice(0, 50).map((detail) => {
      try {
        const field = detail && typeof detail.field === "string" ? detail.field.slice(0, 128) : "unknown";
        const detailCode = detail && typeof detail.code === "string" ? detail.code : "";
        return { field, code: ERROR_CODE_PATTERN.test(detailCode) ? detailCode : "INVALID_DETAIL" };
      } catch {
        // Treat hostile getters/proxies as malformed metadata rather than failing the response.
        return { field: "unknown", code: "INVALID_DETAIL" };
      }
    });
  }
  writeEnvelope(response, statusCode, { success: false, error, meta: { requestId } }, requestId);
}
