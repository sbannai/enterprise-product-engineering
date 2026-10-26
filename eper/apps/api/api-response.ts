import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiErrorDetail { field: string; code: string; }

export function resolveApiRequestId(request: IncomingMessage): string {
  const supplied = request.headers["x-correlation-id"];
  return typeof supplied === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
}

function writeEnvelope(response: ServerResponse, statusCode: number, body: Record<string, unknown>, requestId: string): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  });
  response.end(JSON.stringify(body));
}

export function sendApiSuccess(request: IncomingMessage, response: ServerResponse, statusCode: number, data: Record<string, unknown>): void {
  const requestId = resolveApiRequestId(request);
  writeEnvelope(response, statusCode, { success: true, data, meta: { requestId } }, requestId);
}

export function sendApiError(request: IncomingMessage, response: ServerResponse, statusCode: number, code: string, message: string, details?: ApiErrorDetail[]): void {
  const requestId = resolveApiRequestId(request);
  const error: Record<string, unknown> = { code, message };
  if (details?.length) error.details = details;
  writeEnvelope(response, statusCode, { success: false, error, meta: { requestId } }, requestId);
}
