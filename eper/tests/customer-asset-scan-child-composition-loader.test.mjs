import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertTrustedCustomerAssetScanCompositionModule } from "../dist/packages/assets/customer-asset-scan-child-composition-loader.js";

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "eper-scanner-composition-"));
  const root = join(base, "dist", "packages", "assets", "scanners");
  await mkdir(root, { recursive: true, mode: 0o750 });
  await chmod(root, 0o750);
  const modulePath = join(root, "customer-asset-scan-composition.js");
  await writeFile(modulePath, "export function createCustomerAssetScanChildRuntimeDependencies() {}\n", { mode: 0o640 });
  await chmod(modulePath, 0o640);
  return { base, root, modulePath };
}

test("trusted composition loader accepts a deployment-owned immutable module", async () => {
  const f = await fixture();
  try { assert.equal(await assertTrustedCustomerAssetScanCompositionModule(f.modulePath), f.modulePath); }
  finally { await rm(f.base, { recursive: true, force: true }); }
});

test("trusted composition loader rejects a group/world-writable scanner directory", async () => {
  const f = await fixture();
  try {
    await chmod(f.root, 0o770);
    await assert.rejects(assertTrustedCustomerAssetScanCompositionModule(f.modulePath), /COMPOSITION_DIRECTORY_INVALID/);
  } finally { await rm(f.base, { recursive: true, force: true }); }
});

test("trusted composition loader rejects symlinked module files", async () => {
  const f = await fixture();
  try {
    const target = join(f.root, "target.js");
    await writeFile(target, "export {};\n");
    await rm(f.modulePath);
    await symlink(target, f.modulePath);
    await assert.rejects(assertTrustedCustomerAssetScanCompositionModule(f.modulePath), /COMPOSITION_FILE_INVALID/);
  } finally { await rm(f.base, { recursive: true, force: true }); }
});

test("trusted composition loader rejects a symlinked scanner directory", async () => {
  const f = await fixture();
  try {
    const target = join(f.base, "safe-scanners");
    await mkdir(target, { recursive: true, mode: 0o750 });
    await writeFile(join(target, "customer-asset-scan-composition.js"), "export {};\n");
    await rm(f.root, { recursive: true, force: true });
    await symlink(target, f.root);
    await assert.rejects(assertTrustedCustomerAssetScanCompositionModule(f.modulePath), /COMPOSITION_DIRECTORY_INVALID/);
  } finally { await rm(f.base, { recursive: true, force: true }); }
});
