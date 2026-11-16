import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTrustedCustomerAssetScanChildLaunch, withCustomerAssetScanChildPrivateTempDirectory } from "../dist/packages/assets/customer-asset-scan-child-launcher.js";

function waitForChildReadiness(child) {
  return new Promise((resolve, reject) => {
    let ready = false;
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (!ready) {
        reject(new Error(`child closed before readiness (code=${code}, signal=${signal})`));
      }
    });
    child.stdout.once("data", chunk => {
      ready = true;
      resolve(chunk);
    });
  });
}

const configuration = () => ({
  workloadApiSocket: "unix:///run/spire/sockets/agent.sock",
  expectedSpiffeId: "spiffe://example.org/eper/scanner-child",
  audience: "eper:customer-asset-scan-child",
  databaseHost: "127.0.0.1",
  databaseCaFile: "/run/eper/db/ca.pem",
  databasePort: 5432,
  databaseName: "eper",
  databaseUser: "eper_customer_asset_scan_child",
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
    "PGDATABASE", "PGHOST", "PGPORT", "PGSSLMODE", "PGSSLROOTCERT", "PGUSER",
  ].sort());
  assert.equal(launch.environment.PGSSLMODE, "verify-full");
  assert.equal(launch.environment.PGSSLROOTCERT, "/run/eper/db/ca.pem");
  assert.equal(launch.environment.EPER_SCANNER_CHILD_COMPOSITION_MODULE.endsWith("/customer-asset-scan-composition.js"), true);
  assert.equal(Object.values(launch.environment).some(value => /password|secret|credential/i.test(value)), false);
});

test("trusted scanner launcher rejects non-local SPIFFE endpoint and arbitrary paths", () => {
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), workloadApiSocket: "https://agent.example.org",
  }), /SPIFFE_SOCKET_INVALID/);
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), expectedSpiffeId: "spiffe://example.org/other/../workload",
  }), /SPIFFE_ID_INVALID/);
});

test("trusted scanner launcher validates the restricted database login, CA path and port", () => {
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), databasePort: 70000,
  }), /DATABASE_PORT_INVALID/);
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), databaseCaFile: "relative/ca.pem",
  }), /DATABASE_CA_PATH_INVALID/);
  assert.throws(() => buildTrustedCustomerAssetScanChildLaunch({
    ...configuration(), databaseUser: "",
  }), /DATABASE_USER_INVALID/);
});


test("parent-owned scanner temp directory is removed after child completion", async () => {
  let directory;
  const value = await withCustomerAssetScanChildPrivateTempDirectory(async root => {
    directory = root;
    await mkdir(join(root, "eper-scan-child-key-test"));
    await writeFile(join(root, "eper-scan-child-key-test", "client-key.pem"), "private-key");
    return "child-closed";
  });
  assert.equal(value, "child-closed");
  await assert.rejects(access(directory));
});

test("parent-owned scanner temp directory is removed when child execution rejects", async () => {
  let directory;
  await assert.rejects(withCustomerAssetScanChildPrivateTempDirectory(async root => {
    directory = root;
    await writeFile(join(root, "orphan-key.pem"), "private-key");
    throw new Error("child failed");
  }), /child failed/);
  await assert.rejects(access(directory));
});


test("scanner child readiness rejects when the child closes before its first output", async () => {
  const child = (await import("node:child_process")).spawn(process.execPath, ["-e", "process.exit(2)"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  await assert.rejects(waitForChildReadiness(child), /closed before readiness/);
});

test("parent-owned scanner temp directory is removed after a child is forcibly killed", async () => {
  let directory;
  await withCustomerAssetScanChildPrivateTempDirectory(async root => {
    directory = root;
    const child = (await import("node:child_process")).spawn(process.execPath, ["-e", [
      "const fs=require('node:fs');const path=require('node:path');",
      "fs.writeFileSync(path.join(process.env.TMPDIR,'client-key.pem'),'private-key');",
      "process.stdout.write('credential-ready');",
      "setInterval(()=>{},1000);",
    ].join("")], {
      env: { ...process.env, TMPDIR: root },
      stdio: ["ignore", "pipe", "ignore"],
    });
    await waitForChildReadiness(child);
    const credentialPath = join(root, "client-key.pem");
    await access(credentialPath);
    child.kill("SIGKILL");
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (signal === "SIGKILL") resolve();
        else reject(new Error("child did not close from SIGKILL"));
      });
    });
    // The parent cleanup wrapper must not remove the root before process close.
    await access(credentialPath);
  });
  await assert.rejects(access(directory));
});
