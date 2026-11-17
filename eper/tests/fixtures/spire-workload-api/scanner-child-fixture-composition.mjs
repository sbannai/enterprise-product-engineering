import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import {
  CustomerAssetScanChildSpiffeIdentityVerifier,
} from "../../../dist/packages/assets/customer-asset-scan-child-spiffe-identity.js";
import {
  createCustomerAssetScanChildSpiffeSdkRuntime,
} from "../../../dist/packages/assets/customer-asset-scan-child-spiffe-sdk-adapter.js";
import {
  CustomerAssetScanChildUnixSocketCertificateSigner,
} from "../../../dist/packages/assets/customer-asset-scan-child-database-signer-unix-socket.js";
import {
  CustomerAssetScanChildDatabaseCredentialIssuer,
} from "../../../dist/packages/assets/customer-asset-scan-child-database-credential-issuer.js";
import {
  PostgresCustomerAssetScanChildInputResolver,
} from "../../../dist/packages/assets/customer-asset-scan-child-input-resolver.js";
import {
  verifiedProviderInternalObjectChunks,
} from "../../../dist/packages/integrations/provider-internal-object-read.js";

const EXPECTED_SPIFFE_ID = "spiffe://example.org/ns/scanner/sa/customer-asset-scan-child";
const EXPECTED_ROLE = "eper_fixture_scanner";
const FIXTURE_BYTES = Buffer.from("hello world", "utf8");
const FIXTURE_SHA256 = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

function createSpiffeRuntime() {
  const require = createRequire("/sdk/package.json");
  const { SpiffeClient } = require("@jeengbe/spiffe");
  return createCustomerAssetScanChildSpiffeSdkRuntime({
    endpoint: "unix:///run/spire/agent/public/api.sock",
    SpiffeClient,
  });
}

export async function createCustomerAssetScanChildDatabaseTlsBootstrap({ signal }) {
  const spiffeRuntime = createSpiffeRuntime();
  try {
    const identity = new CustomerAssetScanChildSpiffeIdentityVerifier(
      spiffeRuntime.adapter,
      EXPECTED_SPIFFE_ID,
    );
    const signer = new CustomerAssetScanChildUnixSocketCertificateSigner({
      socketPath: "/signer-ipc/signer.sock",
      timeoutMs: 10_000,
    });
    const issuer = new CustomerAssetScanChildDatabaseCredentialIssuer(
      new Map([[EXPECTED_SPIFFE_ID, EXPECTED_ROLE]]),
      signer,
      120,
    );
    const caPem = await readFile("/fixture/scanner-client-ca.crt", "utf8");
    if (signal.aborted) throw new Error("fixture bootstrap aborted");
    return {
      identity,
      issuer,
      caPem,
      close: () => spiffeRuntime.close(),
    };
  } catch (error) {
    await spiffeRuntime.close().catch(() => {});
    throw error;
  }
}

export async function createCustomerAssetScanChildRuntimeDependencies({
  pool,
  identity,
  signal,
}) {
  assert.ok(pool && typeof pool.query === "function");
  assert.ok(identity && typeof identity.verifyCurrentProcessIdentity === "function");

  const input = new PostgresCustomerAssetScanChildInputResolver(pool);
  const provider = {
    async dispatch(request) {
      if (signal.aborted) throw new Error("fixture aborted");
      assert.equal(request.operation.kind, "read_object_internal");
      assert.equal(request.tenantId, "fixture-tenant");
      assert.equal(request.applicationId, "fixture-application");
      assert.equal(request.expectedConnectionId, "fixture-provider-connection");
      assert.equal(request.operation.request.assetId, "00000000-0000-4000-8000-000000000101");
      assert.equal(request.operation.request.providerObjectReference, "fixture-object://tenant/application/asset-101");
      assert.equal(request.operation.request.expectedSizeBytes, FIXTURE_BYTES.byteLength);
      assert.equal(request.operation.request.expectedSha256, FIXTURE_SHA256);

      const source = {
        async *[Symbol.asyncIterator]() {
          yield FIXTURE_BYTES.subarray(0, 5);
          yield FIXTURE_BYTES.subarray(5);
        },
      };
      return verifiedProviderInternalObjectChunks({
        source,
        expectedSizeBytes: request.operation.request.expectedSizeBytes,
        expectedSha256: request.operation.request.expectedSha256,
        signal: request.signal,
      });
    },
  };

  const scanner = {
    async scan(scanInput, _requestId, scanSignal) {
      assert.equal(scanInput.assetId, "00000000-0000-4000-8000-000000000101");
      assert.equal(scanInput.mimeType, "text/plain");
      assert.equal(scanInput.sizeBytes, FIXTURE_BYTES.byteLength);
      assert.equal(scanInput.checksumSha256, FIXTURE_SHA256);
      let received = 0;
      for await (const chunk of scanInput.source) {
        if (scanSignal.aborted) throw new Error("fixture scan aborted");
        received += chunk.byteLength;
      }
      assert.equal(received, FIXTURE_BYTES.byteLength);
      return { scanStatus: "clean" };
    },
  };

  return { identity, input, provider, scanner };
}
