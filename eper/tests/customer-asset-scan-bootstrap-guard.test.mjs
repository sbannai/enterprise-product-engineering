import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("scan worker dispatches every attempt to the fixed isolated child and never imports a scanner in the parent", async () => {
  const source = await readFile(new URL("../apps/worker/customer-asset-scan-main.ts", import.meta.url), "utf8");
  assert.match(source, /runTrustedCustomerAssetScanChild/);
  assert.match(source, /childRunner:/);
  assert.match(source, /EPER_CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_MODULE/);
  assert.doesNotMatch(source, /createCustomerAssetScanner/);
  assert.doesNotMatch(source, /pathToFileURL\(scannerModulePath/);
  assert.doesNotMatch(source, /CUSTOMER_ASSET_SCAN_CHILD_PROCESS_ISOLATION_REQUIRED/);
});
