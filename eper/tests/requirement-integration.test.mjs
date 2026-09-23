import assert from "node:assert/strict";
import test from "node:test";
import { requirementBindings, requirementCount, getChapterBindings } from "../dist/packages/requirements/registry.js";

test("228 requirements are integrated into the central requirement registry", () => {
  assert.equal(requirementCount, 228);
  assert.equal(requirementBindings[0].id, "REQ-46301");
  assert.equal(requirementBindings.at(-1)?.id, "REQ-50006");
});

test("each chapter has six requirement bindings", () => {
  for (let chapter=463; chapter<=500; chapter++) assert.equal(getChapterBindings(chapter).length, 6);
});

test("all six implementation patterns are represented", () => {
  assert.deepEqual([...new Set(requirementBindings.map(x=>x.pattern))].sort(), ["XX01","XX02","XX03","XX04","XX05","XX06"]);
});

test("every requirement has DATA, API and EVENT integration targets", () => {
  for (const r of requirementBindings) {
    assert.ok(r.dataContract);
    assert.ok(r.apiContract);
    assert.ok(r.eventContract);
  }
});
