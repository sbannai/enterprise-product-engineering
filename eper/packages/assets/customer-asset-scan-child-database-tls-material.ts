import { chmod, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import type { CustomerAssetScanChildSpiffeIdentityVerifier } from "./customer-asset-scan-child-spiffe-identity.js";
import type { CustomerAssetScanChildDatabaseCredentialIssuer } from "./customer-asset-scan-child-database-credential-issuer.js";
import { createCustomerAssetScanChildEphemeralKeyRequest } from "./customer-asset-scan-child-ephemeral-key.js";

const execFile = promisify(execFileCallback);

export interface CustomerAssetScanChildDatabaseTlsMaterial {
  readonly databaseRole: string;
  readonly caPath: string;
  readonly certificatePath: string;
  readonly privateKeyPath: string;
  cleanup(): Promise<void>;
}

/**
 * Obtain child-local PostgreSQL mTLS material. Workload identity is fetched
 * inside this process; only the CSR crosses the issuer boundary. Private key
 * material remains in the child-owned 0700 directory and is removed by cleanup.
 */
export async function provisionCustomerAssetScanChildDatabaseTlsMaterial(input: {
  readonly identity: Pick<CustomerAssetScanChildSpiffeIdentityVerifier, "verifyCurrentProcessIdentity">;
  readonly issuer: Pick<CustomerAssetScanChildDatabaseCredentialIssuer, "issue">;
  readonly caPem: string;
  readonly signal?: AbortSignal;
}): Promise<CustomerAssetScanChildDatabaseTlsMaterial> {
  let keyRequest: Awaited<ReturnType<typeof createCustomerAssetScanChildEphemeralKeyRequest>> | undefined;
  try {
    if (typeof input.caPem !== "string" || input.caPem.length < 80 ||
        input.caPem.length > 65_536 ||
        !input.caPem.includes("-----BEGIN CERTIFICATE-----") ||
        !input.caPem.includes("-----END CERTIFICATE-----") ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.caPem)) {
      throw new Error("CA_MATERIAL_INVALID");
    }
    if (input.signal?.aborted) throw new Error("BOOTSTRAP_ABORTED");
    const workload = await input.identity.verifyCurrentProcessIdentity(input.signal);
    if (input.signal?.aborted) throw new Error("BOOTSTRAP_ABORTED");
    keyRequest = await createCustomerAssetScanChildEphemeralKeyRequest();
    if (input.signal?.aborted) throw new Error("BOOTSTRAP_ABORTED");
    const credential = await input.issuer.issue({ workload, csrPem: keyRequest.csrPem });
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(credential.databaseRole) ||
        !Number.isSafeInteger(credential.expiresAt) ||
        credential.expiresAt <= Math.floor(Date.now() / 1000) ||
        credential.expiresAt > workload.expiresAt ||
        typeof credential.clientCertificatePem !== "string" ||
        credential.clientCertificatePem.length < 80 ||
        credential.clientCertificatePem.length > 65_536 ||
        !credential.clientCertificatePem.includes("-----BEGIN CERTIFICATE-----") ||
        !credential.clientCertificatePem.includes("-----END CERTIFICATE-----")) {
      throw new Error("ISSUED_CREDENTIAL_INVALID");
    }
    if (input.signal?.aborted) throw new Error("BOOTSTRAP_ABORTED");

    const directory = dirname(keyRequest.privateKeyPath);
    const caPath = join(directory, "database-ca.pem");
    const certificatePath = join(directory, "database-client.pem");
    await writeFile(caPath, input.caPem, { mode: 0o600, flag: "wx" });
    await writeFile(certificatePath, credential.clientCertificatePem, { mode: 0o600, flag: "wx" });
    await chmod(caPath, 0o600);
    await chmod(certificatePath, 0o600);

    const [certificatePublicKey, privatePublicKey, verified] = await Promise.all([
      execFile("openssl", ["x509", "-in", certificatePath, "-pubkey", "-noout"], { timeout: 10_000, maxBuffer: 16_384 }),
      execFile("openssl", ["pkey", "-in", keyRequest.privateKeyPath, "-pubout"], { timeout: 10_000, maxBuffer: 16_384 }),
      execFile("openssl", ["verify", "-CAfile", caPath, "-purpose", "sslclient", certificatePath], { timeout: 10_000, maxBuffer: 16_384 }),
    ]);
    if (certificatePublicKey.stdout.trim() !== privatePublicKey.stdout.trim() ||
        !verified.stdout.includes(certificatePath)) {
      throw new Error("ISSUED_CERTIFICATE_BINDING_INVALID");
    }
    const details = await execFile("openssl", [
      "x509", "-in", certificatePath, "-noout", "-subject", "-nameopt", "RFC2253", "-enddate",
      "-ext", "extendedKeyUsage",
    ], { timeout: 10_000, maxBuffer: 16_384 });
    const subject = details.stdout.split("\n").find(line => line.startsWith("subject=")) ?? "";
    const cn = subject.match(/(?:^|,)CN=([^,]+)/)?.[1];
    const endDate = details.stdout.match(/notAfter=(.+)/)?.[1];
    const expiry = endDate ? Math.floor(Date.parse(endDate) / 1000) : 0;
    if (cn !== credential.databaseRole ||
        !/TLS Web Client Authentication|clientAuth/i.test(details.stdout) ||
        !Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000) ||
        expiry > credential.expiresAt || expiry > workload.expiresAt) {
      throw new Error("ISSUED_CERTIFICATE_POLICY_INVALID");
    }
    let cleaned = false;
    return Object.freeze({
      databaseRole: credential.databaseRole,
      caPath,
      certificatePath,
      privateKeyPath: keyRequest.privateKeyPath,
      async cleanup() {
        if (cleaned) return;
        cleaned = true;
        await keyRequest!.cleanup();
      },
    });
  } catch {
    await keyRequest?.cleanup().catch(() => {});
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_TLS_UNAVAILABLE");
  }
}
