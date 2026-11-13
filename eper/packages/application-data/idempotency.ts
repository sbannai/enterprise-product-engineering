import { createHash } from "node:crypto";
import type { ApplicationDataRecord } from "./contracts.js";

/** Hash only stable caller intent. Schema version and generated metadata must not break retries after schema activation. */
export function applicationDataCreateHash(record: Pick<ApplicationDataRecord, "tenantId" | "applicationId" | "entityType" | "id" | "data">): string {
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
    data: record.data
  };
  return createHash("sha256").update(canonical(request)).digest("hex");
}

export function validateApplicationDataIdempotencyKey(key: string | undefined): void {
  if (key !== undefined && (typeof key !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(key))) {
    throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_INVALID");
  }
}

/** Fingerprint a conditional update so retries replay only the same intended mutation. */
export function applicationDataUpdateHash(input: {
  tenantId: string; applicationId: string; entityType: string; id: string;
  expectedVersion: number; patch: { state?: "ACTIVE" | "ARCHIVED"; data?: Record<string, unknown> };
}): string {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map(key => JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
  };
  return createHash("sha256").update(canonical({
    operation: "UPDATE", tenantId: input.tenantId, applicationId: input.applicationId,
    entityType: input.entityType, id: input.id, expectedVersion: input.expectedVersion, patch: input.patch,
  })).digest("hex");
}
