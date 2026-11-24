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
  assert.match(main, /EPER_APPLICATION_PERIPHERAL_DATABASE_URL_REQUIRED/);
  assert.match(main, /eper_application_peripheral_access/);
  assert.match(main, /EPER_APPLICATION_PERIPHERAL_DATABASE_ROLE_SET_REQUIRED/);
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

test("F-023 publication and deprecation serialize against tenant configuration", () => {
  assert.match(repository, /import \{ acquirePeripheralCatalogueTypeLock \}/);

  const publish = repository.slice(
    repository.indexOf("async publish("),
    repository.indexOf("async deprecate("),
  );
  const deprecate = repository.slice(
    repository.indexOf("async deprecate("),
    repository.indexOf("private async audit("),
  );

  assert.ok(publish.indexOf('acquirePeripheralCatalogueTypeLock(c,key,"exclusive")') < publish.indexOf("FOR UPDATE OF d,l"));
  assert.ok(deprecate.indexOf('acquirePeripheralCatalogueTypeLock(c,key,"exclusive")') < deprecate.indexOf("FOR UPDATE OF d"));
});

test("F-023 validates shared primary database identity before serving requests", () => {
  const identityGuard = main.indexOf("await assertPeripheralCatalogueDatabaseIdentity({");
  const listen = main.indexOf("server.listen(port, host");
  assert.ok(identityGuard > 0, "database identity guard must be wired");
  assert.ok(listen > identityGuard, "database identity guard must run before listening");
  assert.match(main, /if \(peripheralApiEnabled\)\s*\{\s*if \(!paymentPool \|\| !peripheralApplicationPool \|\| !peripheralTypeCatalogueReadPool\)/);
  assert.match(main, /application:\s*peripheralApplicationPool/);
  assert.match(main, /payment:\s*paymentPool/);
  assert.match(main, /admin:\s*peripheralTypeCataloguePool/);
  assert.match(main, /read:\s*peripheralTypeCatalogueReadPool/);
});
