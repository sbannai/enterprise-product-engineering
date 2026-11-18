import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../apps/api/main.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../packages/peripherals/postgres-peripheral-type-catalogue-repository.ts", import.meta.url), "utf8");

test("F-023 peripheral type catalogue is composed with an isolated PostgreSQL pool", () => {
  assert.match(main, /PostgresPeripheralTypeCatalogueRepository/);
  assert.match(main, /EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED/);
  assert.match(main, /PERIPHERAL_TYPE_CATALOGUE_REQUIRES_PLATFORM_ADMIN_CREDENTIALS/);
  assert.match(main, /EPER_PERIPHERAL_TYPE_CATALOGUE_DATABASE_URL_REQUIRED/);
  assert.match(main, /eper_peripheral_type_catalogue_access/);
  assert.match(main, /EPER_PERIPHERAL_TYPE_CATALOGUE_DATABASE_ROLE_SET_REQUIRED/);
  assert.ok(main.includes("pg_has_role(current_user, 'eper_peripheral_type_catalogue_access', 'SET')"));
  assert.match(main, /peripheralTypeCatalogueRepository\s*=\s*peripheralTypeCatalogueAdminEnabled/);
  assert.match(main, /peripheralTypeCatalogueRepository,/);
  assert.match(main, /peripheralTypeCataloguePool\.end\(\)/);
  assert.doesNotMatch(main, /new PostgresPeripheralTypeCatalogueRepository\(platformAdminPool/);
  assert.doesNotMatch(main, /new PostgresPeripheralTypeCatalogueRepository\(providerCataloguePool/);
  assert.equal((repository.match(/SET LOCAL ROLE eper_peripheral_type_catalogue_access/g) ?? []).length, 6);
  assert.equal((repository.match(/BEGIN/g) ?? []).length, 6);
});
