import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../apps/api/main.ts", import.meta.url), "utf8");

test("platform-admin credentials require and use a dedicated PostgreSQL pool", () => {
  assert.match(source, /EPER_PLATFORM_ADMIN_DATABASE_URL_REQUIRED/);
  assert.match(source, /new PostgresPlatformAdminCredentialStore\(platformAdminPool,/);
  assert.doesNotMatch(source, /new PostgresPlatformAdminCredentialStore\(paymentPool,/);
  assert.match(source, /if \(platformAdminPool\) await platformAdminPool\.end\(\)/);
});

test("provider catalogue uses its own PostgreSQL pool, not the payment pool", () => {
  assert.match(source, /EPER_PROVIDER_CATALOGUE_DATABASE_URL_REQUIRED/);
  assert.match(source, /new PostgresProviderCatalogueRepository\(providerCataloguePool,/);
  assert.doesNotMatch(source, /new PostgresProviderCatalogueRepository\(paymentPool,/);
  assert.match(source, /if \(providerCataloguePool\) await providerCataloguePool\.end\(\)/);
});
