import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationRegistryService } from "../dist/packages/tenant/application-registry.js";

function clockSequence() {
  let n = 0;
  return () => new Date(Date.parse("2026-10-22T08:00:00.000Z") + n++ * 1000);
}

test("application registry creates and updates a versioned draft", () => {
  const registry = new ApplicationRegistryService(clockSequence());
  const created = registry.create({ tenantId: "tenant-a", name: "School ERP", slug: "school-erp" });
  assert.equal(created.lifecycle, "DRAFT");
  assert.equal(created.version, 1);
  const updated = registry.update("tenant-a", created.applicationId, { name: "School Management", lifecycle: "ACTIVE" });
  assert.equal(updated.name, "School Management");
  assert.equal(updated.lifecycle, "ACTIVE");
  assert.equal(updated.version, 2);
  assert.ok(updated.updatedAt > created.updatedAt);
});

test("list and get are strictly tenant scoped and do not reveal cross-tenant records", () => {
  const registry = new ApplicationRegistryService(clockSequence());
  const app = registry.create({ tenantId: "tenant-a", name: "Finance", slug: "finance" });
  assert.equal(registry.list("tenant-a").length, 1);
  assert.equal(registry.list("tenant-b").length, 0);
  assert.throws(() => registry.get("tenant-b", app.applicationId), /APPLICATION_NOT_FOUND/);
  assert.throws(() => registry.update("tenant-b", app.applicationId, { lifecycle: "ACTIVE" }), /APPLICATION_NOT_FOUND/);
});

test("application slugs are unique per tenant but may be reused across tenants", () => {
  const registry = new ApplicationRegistryService(clockSequence());
  registry.create({ tenantId: "tenant-a", name: "Portal", slug: "Portal" });
  assert.throws(() => registry.create({ tenantId: "tenant-a", name: "Second Portal", slug: "portal" }), /APPLICATION_SLUG_CONFLICT/);
  assert.equal(registry.create({ tenantId: "tenant-b", name: "Portal", slug: "portal" }).tenantId, "tenant-b");
});

test("invalid required fields and slugs are rejected", () => {
  const registry = new ApplicationRegistryService(clockSequence());
  assert.throws(() => registry.create({ tenantId: "", name: "Portal", slug: "portal" }), /APPLICATION_INPUT_REQUIRED/);
  assert.throws(() => registry.create({ tenantId: "tenant-a", name: "Portal", slug: "not a slug" }), /APPLICATION_SLUG_INVALID/);
  const app = registry.create({ tenantId: "tenant-a", name: "Portal", slug: "portal" });
  assert.throws(() => registry.update("tenant-a", app.applicationId, { name: "  " }), /APPLICATION_NAME_REQUIRED/);
});

test("returned records cannot mutate the registry's stored record", () => {
  const registry = new ApplicationRegistryService(clockSequence());
  const app = registry.create({ tenantId: "tenant-a", name: "Portal", slug: "portal" });
  app.name = "tampered";
  assert.equal(registry.get("tenant-a", app.applicationId).name, "Portal");
});
