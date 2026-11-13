import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PostgresCustomerAssetScanChildInputResolver,
  CustomerAssetScanChildInputResolverError,
} from "../dist/packages/assets/customer-asset-scan-child-input-resolver.js";

const start = {
  version: 3, type: "start", jobToken: "a".repeat(64), claimGeneration: 9,
  requestId: "scan-request-9", workerId: "asset-scanner:worker-1",
  scannerServiceId: "asset-scanner",
  input: {
    tenantId: "tenant-a", applicationId: "app-a",
    assetId: "11111111-1111-4111-8111-111111111111",
    checksumSha256: createHash("sha256").update("sample").digest("hex"),
    sizeBytes: 6, mimeType: "text/plain",
  },
};
const workload = { spiffeId: "spiffe://eper.example/asset-scanner/child",
  trustDomain: "eper.example", audience: "eper:customer-asset-scan-child",
  expiresAt: Math.floor(Date.now() / 1000) + 120 };
const sourceRow = {
  tenant_id: "tenant-a", application_id: "app-a",
  worker_id: "asset-scanner:worker-1", scanner_service_id: "asset-scanner",
  spiffe_id: workload.spiffeId, provider_connection_id: "connection-a",
  asset_id: start.input.assetId, storage_adapter_key: "synthetic.storage.v1",
  storage_object_reference: "opaque-storage-object", provider_upload_reference: "opaque-upload",
  checksum_sha256: start.input.checksumSha256, size_bytes: "6", mime_type: "text/plain", attempt: 2,
};
const fixture = ({ rows = [sourceRow], error } = {}) => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    if (error) throw error;
    return { rows };
  } };
  return { resolver: new PostgresCustomerAssetScanChildInputResolver(sql), calls };
};

test("derives complete child authorization scope and pinned provider connection from authenticated DB context", async () => {
  const f = fixture();
  const result = await f.resolver.resolve({ start, workload });
  assert.deepEqual(result, {
    tenantId: "tenant-a", applicationId: "app-a",
    workerId: "asset-scanner:worker-1", scannerServiceId: "asset-scanner",
    assetId: sourceRow.asset_id, storageAdapterKey: "synthetic.storage.v1",
    providerObjectReference: "opaque-storage-object", providerUploadReference: "opaque-upload",
    checksumSha256: start.input.checksumSha256, sizeBytes: 6, mimeType: "text/plain",
    attempt: 2, providerConnectionId: "connection-a",
  });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].statement, "SELECT * FROM public.eper_resolve_customer_asset_scan_child_context($1,$2)");
  assert.deepEqual(f.calls[0].values, [start.input.assetId, start.claimGeneration]);
});

test("rejects database-derived scope that differs from IPC hints or verified SVID", async () => {
  for (const changed of [
    { tenant_id: "other-tenant" },
    { application_id: "other-app" },
    { worker_id: "other-worker" },
    { scanner_service_id: "other-scanner" },
    { spiffe_id: "spiffe://attacker.example/child" },
  ]) {
    const f = fixture({ rows: [{ ...sourceRow, ...changed }] });
    await assert.rejects(() => f.resolver.resolve({ start, workload }), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_BINDING_INVALID",
    });
  }
});

test("rejects missing or ambiguous current scan input", async () => {
  for (const rows of [[], [sourceRow, sourceRow]]) {
    const f = fixture({ rows });
    await assert.rejects(() => f.resolver.resolve({ start, workload }), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_INPUT_STALE",
    });
  }
});

test("rejects changed checksum, size or MIME metadata", async () => {
  for (const changed of [
    { checksum_sha256: "b".repeat(64) },
    { size_bytes: "7" },
    { mime_type: "application/octet-stream" },
  ]) {
    const f = fixture({ rows: [{ ...sourceRow, ...changed }] });
    await assert.rejects(() => f.resolver.resolve({ start, workload }), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_INPUT_STALE",
    });
  }
});

test("fails closed and suppresses database diagnostics", async () => {
  const f = fixture({ error: new Error("password=do-not-leak host=private-db") });
  await assert.rejects(() => f.resolver.resolve({ start, workload }), error =>
    error instanceof CustomerAssetScanChildInputResolverError &&
    error.code === "CUSTOMER_ASSET_SCAN_CHILD_INPUT_UNAVAILABLE" &&
    !error.message.includes("do-not-leak") && !error.message.includes("private-db"));
});

test("rejects malformed IPC envelope before querying PostgreSQL", async () => {
  const f = fixture();
  await assert.rejects(() => f.resolver.resolve({
    start: { ...start, input: undefined }, workload,
  }), error => error instanceof CustomerAssetScanChildInputResolverError &&
    error.code === "CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID");
  assert.equal(f.calls.length, 0);
});

test("rejects a workload identity with a mismatched trust domain or audience before SQL", async () => {
  for (const changed of [
    { trustDomain: "attacker.example" },
    { audience: "other-audience" },
  ]) {
    const f = fixture();
    await assert.rejects(() => f.resolver.resolve({
      start, workload: { ...workload, ...changed },
    }), { code: "CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID" });
    assert.equal(f.calls.length, 0);
  }
});

test("rejects an expired workload SVID before SQL", async () => {
  const f = fixture();
  await assert.rejects(() => f.resolver.resolve({
    start, workload: { ...workload, expiresAt: 1 },
  }), { code: "CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID" });
  assert.equal(f.calls.length, 0);
});
