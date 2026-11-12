import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("legacy in-process scanner bootstrap fails closed in production", async () => {
  const source = await readFile(new URL("../apps/worker/customer-asset-scan-main.ts", import.meta.url), "utf8");
  const guard = source.indexOf('throw new Error("CUSTOMER_ASSET_SCAN_CHILD_PROCESS_ISOLATION_REQUIRED")');
  const poolCreation = source.indexOf("createPostgresPaymentPool({");
  const scannerImport = source.indexOf("await import(pathToFileURL(scannerModulePath).href)");
  assert.ok(guard >= 0, "production child-process isolation guard must exist");
  assert.ok(poolCreation > guard, "guard must run before opening the parent worker pool");
  assert.ok(scannerImport > guard, "guard must run before importing a scanner into the parent");
  assert.match(source, /environment === "production" \|\| process\.env\.EPER_ENVIRONMENT === "production"/);
});
