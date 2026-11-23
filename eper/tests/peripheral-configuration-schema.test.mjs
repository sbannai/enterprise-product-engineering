import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPeripheralConfigurationMatchesSchema,
} from "../dist/packages/peripherals/peripheral-configuration-schema.js";

const schema = {
  type: "object",
  required: ["mode", "retries"],
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["test", "production"], minLength: 1 },
    retries: { type: "integer", minimum: 0, maximum: 5 },
    enabled: { type: "boolean" },
    channels: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string", maxLength: 12 },
    },
  },
};

test("accepts valid settings matching the published schema", () => {
  assert.doesNotThrow(() =>
    assertPeripheralConfigurationMatchesSchema(
      { mode: "test", retries: 2, enabled: true, channels: ["usb"] },
      schema,
    ),
  );
});

test("rejects missing required settings", () => {
  assert.throws(() =>
    assertPeripheralConfigurationMatchesSchema({ mode: "test" }, schema),
    /EPER_PERIPHERAL_CONFIGURATION_SCHEMA_VALIDATION_FAILED/,
  );
});

test("rejects unknown settings when additionalProperties is false", () => {
  assert.throws(() =>
    assertPeripheralConfigurationMatchesSchema(
      { mode: "test", retries: 1, extra: true },
      schema,
    ),
    /EPER_PERIPHERAL_CONFIGURATION_SCHEMA_VALIDATION_FAILED/,
  );
});

test("rejects enum, numeric and boolean type violations", () => {
  for (const settings of [
    { mode: "invalid", retries: 1 },
    { mode: "test", retries: 6 },
    { mode: "test", retries: 1.5 },
    { mode: "test", retries: 1, enabled: "yes" },
  ]) {
    assert.throws(() =>
      assertPeripheralConfigurationMatchesSchema(settings, schema),
    );
  }
});

test("rejects array bounds and invalid array items", () => {
  for (const settings of [
    { mode: "test", retries: 1, channels: [] },
    { mode: "test", retries: 1, channels: ["a", "b", "c", "d"] },
    { mode: "test", retries: 1, channels: ["this-channel-name-is-too-long"] },
  ]) {
    assert.throws(() =>
      assertPeripheralConfigurationMatchesSchema(settings, schema),
    );
  }
});

test("rejects non-object settings and excessive schema depth", () => {
  assert.throws(() =>
    assertPeripheralConfigurationMatchesSchema([], schema),
  );

  let deepSchema = { type: "string" };
  for (let i = 0; i < 10; i++) {
    deepSchema = { type: "array", items: deepSchema };
  }

  let deepValue = "leaf";
  for (let i = 0; i < 10; i++) {
    deepValue = [deepValue];
  }

  assert.throws(() =>
    assertPeripheralConfigurationMatchesSchema(deepValue, deepSchema),
    /EPER_PERIPHERAL_CONFIGURATION_SCHEMA_VALIDATION_FAILED/,
  );
});
