import { createHash } from "node:crypto";
import type { ApplicationDataField, ApplicationDataModel, ApplicationDataScope } from "./types.js";

const ID = /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/;

export function validateApplicationDataScope(scope: ApplicationDataScope): void {
  for (const [name, value] of Object.entries(scope)) {
    if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/.test(value)) {
      throw new Error("APPLICATION_DATA_INVALID_" + name.toUpperCase());
    }
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b))
      .map(([key,item]) => JSON.stringify(key) + ":" + canonicalJson(item)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

export function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function validateEntityModel(input: unknown): asserts input is {
  entityType: string; fields: ApplicationDataField[]; relationships?: ApplicationDataModel["relationships"];
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("APPLICATION_DATA_MODEL_INVALID");
  const model = input as Record<string, unknown>;
  if (typeof model.entityType !== "string" || !ID.test(model.entityType) ||
      !Array.isArray(model.fields) || model.fields.length < 1 || model.fields.length > 200 ||
      (model.relationships !== undefined && (!Array.isArray(model.relationships) || model.relationships.length > 100))) {
    throw new Error("APPLICATION_DATA_MODEL_INVALID");
  }
  const ids = new Set<string>();
  for (const raw of model.fields) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("APPLICATION_DATA_FIELD_INVALID");
    const field = raw as Record<string, unknown>;
    if (typeof field.id !== "string" || !ID.test(field.id) || ids.has(field.id) ||
        typeof field.label !== "string" || !field.label.trim() || field.label.length > 200 ||
        !["string","number","boolean","date","object","array","reference"].includes(String(field.type)) ||
        (field.required !== undefined && typeof field.required !== "boolean") ||
        (field.nullable !== undefined && typeof field.nullable !== "boolean")) {
      throw new Error("APPLICATION_DATA_FIELD_INVALID");
    }
    ids.add(field.id);
    for (const key of ["minLength","maxLength","minimum","maximum"] as const) {
      const value = field[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        throw new Error("APPLICATION_DATA_FIELD_CONSTRAINT_INVALID:" + field.id);
      }
    }
    if (field.type === "array" && !["string","number","boolean","date","object"].includes(String(field.itemType))) {
      throw new Error("APPLICATION_DATA_ARRAY_ITEM_TYPE_REQUIRED:" + field.id);
    }
    if (field.type === "reference" && (typeof field.referenceEntity !== "string" || !ID.test(field.referenceEntity))) {
      throw new Error("APPLICATION_DATA_REFERENCE_ENTITY_REQUIRED:" + field.id);
    }
    if (field.options !== undefined && (!Array.isArray(field.options) || field.options.length > 200 ||
        field.options.some(value => !["string","number","boolean"].includes(typeof value)))) {
      throw new Error("APPLICATION_DATA_FIELD_OPTIONS_INVALID:" + field.id);
    }
  }
  const relationIds = new Set<string>();
  for (const raw of (model.relationships ?? []) as unknown[]) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("APPLICATION_DATA_RELATIONSHIP_INVALID");
    const relation = raw as Record<string, unknown>;
    if (typeof relation.id !== "string" || !ID.test(relation.id) || relationIds.has(relation.id) ||
        typeof relation.label !== "string" || !relation.label.trim() ||
        typeof relation.targetEntity !== "string" || !ID.test(relation.targetEntity) ||
        !["one","many"].includes(String(relation.cardinality))) {
      throw new Error("APPLICATION_DATA_RELATIONSHIP_INVALID");
    }
    relationIds.add(relation.id);
  }
}

function validScalar(type: string, value: unknown): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "date": return typeof value === "string" && Number.isFinite(Date.parse(value)) && !Number.isNaN(Date.parse(value));
    case "object": return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    default: return false;
  }
}

export function validateRecordData(model: ApplicationDataModel, data: unknown): asserts data is Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("APPLICATION_DATA_RECORD_OBJECT_REQUIRED");
  const value = data as Record<string, unknown>;
  const fields = new Map(model.fields.map(field => [field.id, field]));
  for (const key of Object.keys(value)) if (!fields.has(key)) throw new Error("APPLICATION_DATA_UNKNOWN_FIELD:" + key);
  for (const field of model.fields) {
    const item = value[field.id];
    if (item === undefined) {
      if (field.required) throw new Error("APPLICATION_DATA_REQUIRED_FIELD:" + field.id);
      continue;
    }
    if (item === null) {
      if (field.nullable) continue;
      throw new Error("APPLICATION_DATA_NULL_NOT_ALLOWED:" + field.id);
    }
    let valid = false;
    if (field.type === "reference") valid = typeof item === "string" && item.length > 0 && item.length <= 128;
    else if (field.type === "array") valid = Array.isArray(item) && item.length <= 10_000 &&
      item.every(entry => entry === null ? field.nullable === true : validScalar(String(field.itemType), entry));
    else valid = validScalar(field.type, item);
    if (!valid) throw new Error("APPLICATION_DATA_FIELD_TYPE_INVALID:" + field.id);
    if (typeof item === "string") {
      if (field.minLength !== undefined && item.length < field.minLength) throw new Error("APPLICATION_DATA_FIELD_TOO_SHORT:" + field.id);
      if (field.maxLength !== undefined && item.length > field.maxLength) throw new Error("APPLICATION_DATA_FIELD_TOO_LONG:" + field.id);
      if (field.options && !field.options.includes(item)) throw new Error("APPLICATION_DATA_FIELD_OPTION_INVALID:" + field.id);
    }
    if (typeof item === "number") {
      if (field.minimum !== undefined && item < field.minimum) throw new Error("APPLICATION_DATA_FIELD_BELOW_MINIMUM:" + field.id);
      if (field.maximum !== undefined && item > field.maximum) throw new Error("APPLICATION_DATA_FIELD_ABOVE_MAXIMUM:" + field.id);
      if (field.options && !field.options.includes(item)) throw new Error("APPLICATION_DATA_FIELD_OPTION_INVALID:" + field.id);
    }
  }
}
