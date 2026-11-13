import test from "node:test";
import assert from "node:assert/strict";
import { buildTrustedCustomerAssetScanChildLaunch } from "../dist/packages/assets/customer-asset-scan-child-launcher.js";

const configuration = () => ({
  workloadApiSocket: "unix:///run/spire/sockets/agent.sock",
  expectedSpiffeId: "spiffe://example.org/eper/scanner-child",
  audience: "eper:customer-asset-scan-child",
  databaseHost: "127.0.0.1",
  databasePort: 5432,
  databaseName: "eper",
  databaseUser: "eper_customer_asset_scan_child",
  databaseCaFile: "/run/eper/db/ca.pem",
  databaseClientCertificateFile: "/run/eper/db/client.pem",
  databaseClientKeyFile: "/run/eper/db/client-key.pem",
  compositionModulePath: "./dist/packages/assets/scanners/customer-asset-scan-composition.js",
});

test("trusted scanner launcher fixes Node executable, child entrypoint and runtime flags", () => {
  const launch = buildTrustedCustomerAssetScanChildLaunch(configuration());
  assert.equal(launch.executable, process.execPath);
  assert.deepEqual(launch.args, [
    "--disable-proto=throw",
    new URL("../../apps/worker/customer-asset-scan-child-main.js",
      new URL("../dist/packages/assets/customer-asset-scan-child-launcher.js", import.meta.url)).pathname,
  ]);
});

test("trusted scanner launcher passes only explicit SPIFFE and certificate-authenticated DB settings", () => {
  const launch = buildTrustedCustomerAssetScanChildLaunch(configuration());
  assert.deepEqual(Object.keys(launch.environment).sort(), [
    "EPER_SCANNER_CHILD_COMPOSITION_MODULE",
    "EPER_SCANNER_CHILD_EXPECTED_SPIFFE_ID",
    "EPER_SCANNER_CHILD_SPIFFE_AUDIENCE",
    "EPER_SCANNER_CHILD_SPIFFE_WORKLOAD_API_SOCKET",
    "PGDATABASE", "PGHOST", "PGPORT", "PGSSLCERT", "PGSSLKEY", "PGSSLMODE",
    "PGSSLROOTCERT", "PGUSER",
  ].sort());
  assert.equal(launch.environment.PGSSLMODE, "verify-full");
  assert.match(launch.environment.EPER_SCANNER_CHILD_COMPOSITION_MODULE, /dist\\/packages\\/assets\\/scanners\\/customer-asset-scan-composition\\.js$/);
  assert.equal(launch.environment.PGSSLKEY, "/run/eper/db/client-key.pem");
  assert.equal(Object.values(launch.environment).some(value => /password|secret|credential/i.test(value)), false);
});

test("trusted scanner launcher rejects non-local SPIFFE endpoint and arbitrary paths", () => {
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), workloadApiSocket: "https://agent.example.org",
  }), /SPIFFE_SOCKET_INVALID/);
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), databaseClientKeyFile: "relative/client-key.pem",
  }), /DATABASE_KEY_PATH_INVALID/);
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), expectedSpiffeId: "spiffe://example.org/other/../workload",
  }), /SPIFFE_ID_INVALID/);
});

test("trusted scanner launcher validates the restricted database login and port", () => {
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), databasePort: 70000,
  }), /DATABASE_PORT_INVALID/);
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), databaseUser: "",
  }), /DATABASE_USER_INVALID/);
});
