export type PeripheralConfigurationSchema = Record<string, unknown>;

const invalid = (): never => {
  throw new Error("EPER_PERIPHERAL_CONFIGURATION_SCHEMA_VALIDATION_FAILED");
};

export function assertPeripheralConfigurationMatchesSchema(
  value: unknown,
  schema: PeripheralConfigurationSchema,
  depth = 0,
): void {
  if (depth > 8 || !schema || typeof schema !== "object" || Array.isArray(schema)) invalid();

  const type = schema.type;
  const matches =
    type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value) :
    type === "array" ? Array.isArray(value) :
    type === "string" ? typeof value === "string" :
    type === "number" ? typeof value === "number" && Number.isFinite(value) :
    type === "integer" ? typeof value === "number" && Number.isSafeInteger(value) :
    type === "boolean" ? typeof value === "boolean" :
    false;

  if (!matches) invalid();

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) invalid();

  if (type === "object") {
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, PeripheralConfigurationSchema>;
    const required = (schema.required ?? []) as string[];

    if (required.some((key) => !Object.hasOwn(object, key))) invalid();

    if (schema.additionalProperties === false &&
        Object.keys(object).some((key) => !Object.hasOwn(properties, key))) invalid();

    for (const [key, item] of Object.entries(object)) {
      const childSchema = properties[key];
      if (childSchema) assertPeripheralConfigurationMatchesSchema(item, childSchema, depth + 1);
    }
    return;
  }

  if (type === "array") {
    const items = value as unknown[];
    if (typeof schema.minItems === "number" && items.length < schema.minItems) invalid();
    if (typeof schema.maxItems === "number" && items.length > schema.maxItems) invalid();
    for (const item of items) {
      assertPeripheralConfigurationMatchesSchema(item, schema.items as PeripheralConfigurationSchema, depth + 1);
    }
    return;
  }

  if (type === "string") {
    const string = value as string;
    if (typeof schema.minLength === "number" && string.length < schema.minLength) invalid();
    if (typeof schema.maxLength === "number" && string.length > schema.maxLength) invalid();
  }

  if (type === "number" || type === "integer") {
    const number = value as number;
    if (typeof schema.minimum === "number" && number < schema.minimum) invalid();
    if (typeof schema.maximum === "number" && number > schema.maximum) invalid();
  }
}
