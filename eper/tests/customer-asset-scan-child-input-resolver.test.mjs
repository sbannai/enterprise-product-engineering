import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PostgresCustomerAssetScanChildInputResolver,
  CustomerAssetScanChildInputResolverError,
} from "../dist/packages/assets/customer-asset-scan-child-input-resolver.js";
import { CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY } from "../dist/packages/assets/customer-asset-scan-child-identity.js";

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
const identity = {
  issuer: "eper-workload-identity", subject: "scanner-child",
  audience: "eper:customer-asset-scan-child", tenantId: "tenant-a",
  applicationId: "app-a", connectionId: "connection-a",
  scannerServiceId: "asset-scanner", capability: CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY,
  issuedAt: 1_800_000_000, expiresAt: 1_800_000_120, tokenId: "token-9",
};
const workload = { spiffeId: "spiffe://eper.example/asset-scanner/child",
  trustDomain: "eper.example", audience: "eper:customer-asset-scan-child", expiresAt: 1_800_000_120 };
const sourceRow = {
  asset_id: start.input.assetId, storage_adapter_key: "synthetic.storage.v1",
  storage_object_reference: "opaque-storage-object", provider_upload_reference: "opaque-upload",
  checksum_sha256: start.input.checksumSha256, size_bytes: "6", mime_type: "text/plain", attempt: 2,
};
const fixture = ({ inputRows = [sourceRow], bindingRows = [{ provider_connection_id: "connection-a" }], error } = {}) => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    if (error) throw error;
    return { rows: statement.includes("_child_input(") ? inputRows : bindingRows };
  } };
  return { resolver: new PostgresCustomerAssetScanChildInputResolver(sql), calls };
};

test("resolves only the current leased input and exact workload-bound provider connection via definer functions", async () => {
  const f = fixture();
  const result = await f.resolver.resolve({ start, identity, workload });
  assert.deepEqual(result, {
    assetId: sourceRow.asset_id, storageAdapterKey: "synthetic.storage.v1",
    providerObjectReference: "opaque-storage-object", providerUploadReference: "opaque-upload",
    checksumSha256: start.input.checksumSha256, sizeBytes: 6, mimeType: "text/plain",
    attempt: 2, providerConnectionId: "connection-a",
  });
  assert.deepEqual(f.calls.map(call => call.values), [
    ["tenant-a", "app-a", start.input.assetId, "asset-scanner:worker-1", "asset-scanner", 9],
    ["tenant-a", "app-a", start.input.assetId, "asset-scanner:worker-1", "asset-scanner", 9, workload.spiffeId],
  ]);
  assert.match(f.calls[0].statement, /eper_resolve_customer_asset_scan_child_input/);
  assert.match(f.calls[1].statement, /eper_resolve_customer_asset_scan_child_provider_binding/);
});

test("rejects identity scope drift before querying the child database", async () => {
  const f = fixture();
  await assert.rejects(() => f.resolver.resolve({
    start, identity: { ...identity, applicationId: "other-app" }, workload,
  }), error => error instanceof CustomerAssetScanChildInputResolverError &&
    error.code === "CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID");
  assert.equal(f.calls.length, 0);
});

test("rejects missing or ambiguous current scan input", async () => {
  for (const rows of [[], [sourceRow, sourceRow]]) {
    const f = fixture({ inputRows: rows });
    await assert.rejects(() => f.resolver.resolve({ start, identity, workload }), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_INPUT_STALE",
    });
    assert.equal(f.calls.length, 1);
  }
});

test("rejects changed checksum, size or MIME metadata before provider binding", async () => {
  for (const changed of [
    { checksum_sha256: "b".repeat(64) },
    { size_bytes: "7" },
    { mime_type: "application/octet-stream" },
  ]) {
    const f = fixture({ inputRows: [{ ...sourceRow, ...changed }] });
    await assert.rejects(() => f.resolver.resolve({ start, identity, workload }), {
      code: "CUSTOMER_ASSET_SCAN_CHILD_INPUT_STALE",
    });
    assert.equal(f.calls.length, 1);
  }
});

test("rejects a provider binding that differs from the authenticated identity connection", async () => {
  const f = fixture({ bindingRows: [{ provider_connection_id: "connection-other" }] });
  await assert.rejects(() => f.resolver.resolve({ start, identity, workload }), {
    code: "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_BINDING_INVALID",
  });
  assert.equal(f.calls.length, 2);
});

test("fails closed and suppresses database diagnostics", async () => {
  const f = fixture({ error: new Error("password=do-not-leak host=private-db") });
  await assert.rejects(() => f.resolver.resolve({ start, identity, workload }), error =>
    error instanceof CustomerAssetScanChildInputResolverError &&
    error.code === "CUSTOMER_ASSET_SCAN_CHILD_INPUT_UNAVAILABLE" &&
    !error.message.includes("do-not-leak") && !error.message.includes("private-db"));
});

test("rejects malformed IPC envelope before dereferencing input or querying PostgreSQL", async () => {
  const f = fixture();
  await assert.rejects(() => f.resolver.resolve({
    start: { ...start, input: undefined }, identity, workload,
  }), error => error instanceof CustomerAssetScanChildInputResolverError &&
    error.code === "CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID");
  assert.equal(f.calls.length, 0);
});
