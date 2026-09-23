import assert from "node:assert/strict";
import test from "node:test";
import { BusinessValidationEngine } from "../dist/packages/capabilities/business-validation.js";

test("business validation accepts input when all rules pass", () => {
  const engine = new BusinessValidationEngine();
  engine.addRule({
    id: "required-name",
    evaluate: (input) => input.name ? null : { code: "NAME_REQUIRED", message: "Name is required", severity: "ERROR" },
  });

  const result = engine.validate({ name: "Example" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test("business validation returns rule violations", () => {
  const engine = new BusinessValidationEngine();
  engine.addRule({
    id: "positive-amount",
    evaluate: (input) => input.amount > 0 ? null : { code: "AMOUNT_INVALID", message: "Amount must be positive", severity: "ERROR" },
  });
  engine.addRule({
    id: "amount-warning",
    evaluate: (input) => input.amount < 10 ? { code: "AMOUNT_LOW", message: "Amount is low", severity: "WARNING" } : null,
  });

  const result = engine.validate({ amount: 0 });
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), ["AMOUNT_INVALID", "AMOUNT_LOW"]);
});

test("business validation rejects duplicate and invalid rules", () => {
  const engine = new BusinessValidationEngine();
  engine.addRule({ id: "r1", evaluate: () => null });
  assert.throws(() => engine.addRule({ id: "r1", evaluate: () => null }), /VALIDATION_RULE_DUPLICATE/);
  assert.throws(() => engine.addRule({ id: "", evaluate: () => null }), /VALIDATION_RULE_INVALID/);
});
