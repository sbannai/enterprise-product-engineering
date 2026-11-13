import { createHash } from "node:crypto";
import type { ApplicationDataRecord } from "./contracts.js";

/** Hash only the semantic create request; generated timestamps and tracing metadata must not break retries. */
export function applicationDataCreateHash(record: ApplicationDataRecord): string {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map(key => JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
  };
  const request = {
    tenantId: record.tenantId,
    applicationId: record.applicationId,
    entityType: record.entityType,
    id: record.id,
    schemaVersion: record.schemaVersion,
    state: record.state,
    data: record.data
  };
  return createHash("sha256").update(canonical(request)).digest("hex");
}

export function validateApplicationDataIdempotencyKey(key: string | undefined): void {
  if (key !== undefined && (typeof key !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(key))) {
    throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_INVALID");
  }
}
