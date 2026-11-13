import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, sep } from "node:path";

/**
 * Accept only immutable deployment-owned scanner composition code. Checking
 * the containing directory as well as the module prevents an untrusted writer
 * from replacing a previously validated module before it is imported.
 */
export async function assertTrustedCustomerAssetScanCompositionModule(value: string): Promise<string> {
  if (typeof value !== "string" || !isAbsolute(value) || value.split(sep).includes("..") || !value.endsWith(".js")) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_PATH_INVALID");
  }
  const marker = sep + "dist" + sep + "packages" + sep + "assets" + sep + "scanners" + sep;
  const markerIndex = value.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_PATH_INVALID");
  const root = value.slice(0, markerIndex + marker.length - 1);
  const rel = relative(root, value);
  if (!rel || rel === ".." || rel.startsWith(".." + sep) || dirname(value) !== root) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_PATH_INVALID");
  }
  try {
    let current = root;
    while (true) {
      const directory = await lstat(current);
      if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o022) !== 0 ||
          await realpath(current) !== current) {
        throw new Error("unsafe composition directory");
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_DIRECTORY_INVALID");
  }
  try {
    const file = await lstat(value);
    if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o022) !== 0 ||
        file.size < 1 || file.size > 1_048_576 || await realpath(value) !== value) {
      throw new Error("unsafe composition file");
    }
  } catch {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_FILE_INVALID");
  }
  return value;
}
