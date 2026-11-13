import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("peripheral API runtime requires and injects durable vendor dependency inventory", async () => {
  const source = await readFile(new URL("../apps/api/main.ts", import.meta.url), "utf8");

  assert.match(source, /import \{ PostgresDependencyInventoryRepository \} from ["']\.\.\/\.\.\/packages\/dependencies\/postgres-dependency-inventory-repository\.js["']/);
  assert.match(source, /const dependencyInventory = peripheralApiEnabled && paymentPool\s*\? new PostgresDependencyInventoryRepository\(paymentPool,/);
  assert.match(source, /if \(dependencyInventory\) await dependencyInventory\.assertReady\(\)/);
  assert.match(source, /dependencyIds: \[\]/);
  assert.match(source, /peripheralRoleAuthorizer,\s*dependencyInventory,\s*\)/);
});
