import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export interface CustomerAssetScanChildEphemeralKeyRequest {
  readonly csrPem: string;
  /** Child-local path; this private key must never be sent over IPC or to the issuer. */
  readonly privateKeyPath: string;
  /** Removes the private key and its containing directory. Safe to call more than once. */
  cleanup(): Promise<void>;
}

/**
 * Creates an ephemeral P-256 key and PKCS#10 CSR inside the scanner child.
 * Only csrPem may cross the issuer boundary; privateKeyPath stays in this
 * process and is deleted after the PostgreSQL connection has closed.
 */
export async function createCustomerAssetScanChildEphemeralKeyRequest():
  Promise<CustomerAssetScanChildEphemeralKeyRequest> {
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), "eper-scan-child-key-"));
    await chmod(directory, 0o700);
    const privateKeyPath = join(directory, "client-key.pem");
    const csrPath = join(directory, "client-request.pem");
    await execFile("openssl", [
      "req", "-new", "-newkey", "ec",
      "-pkeyopt", "ec_paramgen_curve:P-256",
      "-nodes", "-sha256",
      "-keyout", privateKeyPath,
      "-out", csrPath,
      // The issuer must ignore this untrusted subject and set the CN from
      // its independently selected databaseRole.
      "-subj", "/CN=eper-scanner-child",
    ], { timeout: 15_000, maxBuffer: 16_384 });
    await chmod(privateKeyPath, 0o600);
    const [keyMetadata, csrPem] = await Promise.all([
      stat(privateKeyPath),
      readFile(csrPath, "utf8"),
    ]);
    if ((keyMetadata.mode & 0o777) !== 0o600 ||
        csrPem.length < 80 || csrPem.length > 65_536 ||
        !csrPem.includes("-----BEGIN CERTIFICATE REQUEST-----") ||
        !csrPem.includes("-----END CERTIFICATE REQUEST-----")) {
      throw new Error("EPHEMERAL_KEY_REQUEST_INVALID");
    }
    let cleaned = false;
    return Object.freeze({
      csrPem,
      privateKeyPath,
      async cleanup() {
        if (cleaned) return;
        cleaned = true;
        await rm(directory!, { recursive: true, force: true });
      },
    });
  } catch {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_KEY_GENERATION_UNAVAILABLE");
  }
}
