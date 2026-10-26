import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiErrorDetail { field: string; code: string; }

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

export function resolveApiRequestId(request: IncomingMessage): string {
  const supplied = request.headers["x-correlation-id"];
  return typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

function writeEnvelope(response: ServerResponse, statusCode: number, body: Record<string, unknown>, requestId: string): void {
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
  response.end(JSON.stringify(body));
}

export function sendApiSuccess(request: IncomingMessage, response: ServerResponse, statusCode: number, data: Record<string, unknown>): void {
  if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode >= 300 || (statusCode === 204 || statusCode === 205) && Object.keys(data).length > 0) {
    throw new TypeError("API_SUCCESS_STATUS_OR_BODY_INVALID");
  }
  const requestId = resolveApiRequestId(request);
  writeEnvelope(response, statusCode, { success: true, data, meta: { requestId } }, requestId);
}

export function sendApiError(request: IncomingMessage, response: ServerResponse, statusCode: number, code: string, message: string, details?: ApiErrorDetail[]): void {
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    throw new TypeError("API_ERROR_STATUS_INVALID");
  }
  if (!ERROR_CODE_PATTERN.test(code)) {
    throw new TypeError("API_ERROR_CODE_INVALID");
  }
  const requestId = resolveApiRequestId(request);
  const error: Record<string, unknown> = { code, message: message.trim() || "The request could not be completed." };
  if (details?.length) {
    error.details = details.map(({ field, code: detailCode }) => ({
      field: field.slice(0, 128),
      code: ERROR_CODE_PATTERN.test(detailCode) ? detailCode : "INVALID_DETAIL",
    }));
  }
  writeEnvelope(response, statusCode, { success: false, error, meta: { requestId } }, requestId);
}
