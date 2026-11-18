import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { runTrustedCustomerAssetScanChild } from "../../../dist/packages/assets/customer-asset-scan-child-launcher.js";

const start = {
  version: 3,
  type: "start",
  jobToken: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  claimGeneration: 7,
  requestId: "fixture-cancel-midflight",
  workerId: "fixture-scanner:worker-01",
  scannerServiceId: "fixture-scanner",
  input: {
    tenantId: "fixture-tenant",
    applicationId: "fixture-application",
    assetId: "00000000-0000-4000-8000-000000000101",
    checksumSha256: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    sizeBytes: 11,
    mimeType: "text/plain",
  },
};

const marker = "/control/scanner-entered";
const before = new Set((await readdir("/tmp")).filter(name => name.startsWith("eper-scan-child-parent-")));
const controller = new AbortController();
const pending = runTrustedCustomerAssetScanChild({
  start,
  timeoutMs: 20_000,
  signal: controller.signal,
  configuration: {
    workloadApiSocket: "unix:///run/spire/agent/public/api.sock",
    expectedSpiffeId: "spiffe://example.org/ns/scanner/sa/customer-asset-scan-child",
    audience: "eper:customer-asset-scan-child",
    databaseHost: "audit-postgres",
    databaseCaFile: "/fixture/ca.crt",
    databasePort: 5432,
    databaseName: "eper_scanner_fixture",
    databaseUser: "eper_fixture_scanner",
    compositionModulePath: "./dist/packages/assets/scanners/fixture-composition.js",
  },
});

let entered = false;
const deadline = Date.now() + 15_000;
try {
  while (Date.now() < deadline) {
    try {
      await access(marker);
      entered = true;
      break;
    } catch {
      await delay(50);
    }
  }
  assert.equal(entered, true, "production child must reach the scanner after live SPIRE and PostgreSQL bootstrap");
  const abortedAt = Date.now();
  controller.abort();
  await assert.rejects(pending, /CUSTOMER_ASSET_SCAN_CHILD_ABORTED/);
  assert.ok(Date.now() - abortedAt < 2_000, "parent cancellation must close the child within the bounded interval");

  const after = await readdir("/tmp");
  const leaked = after.filter(name => name.startsWith("eper-scan-child-parent-") && !before.has(name));
  assert.deepEqual(leaked, [], "parent-owned private TMPDIR must be removed after child close");
  console.log("PASS: live SPIRE/PostgreSQL scanner child reached the blocked scanner and parent AbortSignal terminated it");
  console.log("PASS: parent waited for child close and removed the per-attempt private TMPDIR");
} catch (error) {
  controller.abort();
  await pending.catch(() => undefined);
  throw error;
}
