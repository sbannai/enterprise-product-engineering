import { chmod, writeFile, rm } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import type { CustomerAssetScanChildSpiffeIdentityVerifier } from "./customer-asset-scan-child-spiffe-identity.js";
import type { CustomerAssetScanChildDatabaseCredentialIssuer } from "./customer-asset-scan-child-database-credential-issuer.js";
import { createCustomerAssetScanChildEphemeralKeyRequest } from "./customer-asset-scan-child-ephemeral-key.js";

const execFile = promisify(execFileCallback);

/**
 * Require a DNS hostname so node-postgres performs TLS hostname verification.
 * Literal IPs need explicit IP-SAN verification, which this worker does not
 * currently implement; reject them rather than silently verifying only CA trust.
 */
export function assertCustomerAssetScanChildPostgresDnsHost(host: string): string {
  if (typeof host !== "string" || host.length === 0 || host.trim() !== host ||
      host.length > 253 || isIP(host) !== 0 ||
      !/^(?=.{1,253}$)(?=.*[A-Za-z])[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/.test(host)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_HOST_IDENTITY_INVALID");
  }
  // WHATWG URL parsing canonicalizes resolver-recognized IPv4 aliases such as
  // 127.1 and 0x7f000001. Reject these too: they are not DNS identities even
  // though node:net isIP() does not recognize their original spelling.
  let canonicalHost: string;
  try {
    canonicalHost = new URL(`https://${host}`).hostname;
  } catch {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_HOST_IDENTITY_INVALID");
  }
  if (isIP(canonicalHost) !== 0) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_HOST_IDENTITY_INVALID");
  }
  return host;
}

/** Extract the role CN from OpenSSL's RFC2253 subject output. */
export function parseCustomerAssetScanChildDatabaseCertificateRole(subjectOutput: string): string | undefined {
  if (typeof subjectOutput !== "string" || subjectOutput.length > 16_384) return undefined;
  const subject = (subjectOutput.split(/\r?\n/).find(line => line.startsWith("subject=")) ?? "")
    .slice("subject=".length);
  return subject.match(/(?:^|,)CN=([^,]+)/)?.[1]?.trim();
}

export interface CustomerAssetScanChildDatabaseTlsMaterial {
  readonly databaseRole: string;
  readonly caPath: string;
  readonly databaseCaPath: string;
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
  readonly databaseCaPem: string;
  readonly signal?: AbortSignal;
  readonly onStage?: (stage: "identity" | "key" | "issuer" | "certificate-write" | "certificate-key-binding" | "certificate-ca-validation" | "certificate-policy") => void;
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
    if (typeof input.databaseCaPem !== "string" || input.databaseCaPem.length < 80 ||
        input.databaseCaPem.length > 65_536 ||
        !input.databaseCaPem.includes("-----BEGIN CERTIFICATE-----") ||
        !input.databaseCaPem.includes("-----END CERTIFICATE-----") ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.databaseCaPem)) {
      throw new Error("DATABASE_CA_MATERIAL_INVALID");
    }
    if (input.signal?.aborted) throw new Error("BOOTSTRAP_ABORTED");
    input.onStage?.("identity");
    const workload = await input.identity.verifyCurrentProcessIdentity(input.signal);
    if (input.signal?.aborted) throw new Error("BOOTSTRAP_ABORTED");
    input.onStage?.("key");
    keyRequest = await createCustomerAssetScanChildEphemeralKeyRequest();
    if (input.signal?.aborted) throw new Error("BOOTSTRAP_ABORTED");
    input.onStage?.("issuer");
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
    const databaseCaPath = join(directory, "postgres-server-ca.pem");
    const certificatePath = join(directory, "database-client.pem");
    input.onStage?.("certificate-write");
    await writeFile(caPath, input.caPem, { mode: 0o600, flag: "wx" });
    await writeFile(databaseCaPath, input.databaseCaPem, { mode: 0o600, flag: "wx" });
    await writeFile(certificatePath, credential.clientCertificatePem, { mode: 0o600, flag: "wx" });
    await chmod(caPath, 0o600);
    await chmod(databaseCaPath, 0o600);
    await chmod(certificatePath, 0o600);

    input.onStage?.("certificate-key-binding");
    const [certificatePublicKey, privatePublicKey] = await Promise.all([
      execFile("openssl", ["x509", "-in", certificatePath, "-pubkey", "-noout"], { timeout: 10_000, maxBuffer: 16_384 }),
      execFile("openssl", ["pkey", "-in", keyRequest.privateKeyPath, "-pubout"], { timeout: 10_000, maxBuffer: 16_384 }),
    ]);
    if (certificatePublicKey.stdout.trim() !== privatePublicKey.stdout.trim()) {
      throw new Error("ISSUED_CERTIFICATE_BINDING_INVALID");
    }
    input.onStage?.("certificate-ca-validation");
    const verified = await execFile("openssl", ["verify", "-CAfile", caPath, "-purpose", "sslclient", certificatePath], { timeout: 10_000, maxBuffer: 16_384 });
    if (!verified.stdout.includes(certificatePath)) throw new Error("ISSUED_CERTIFICATE_CA_INVALID");
    input.onStage?.("certificate-policy");
    const details = await execFile("openssl", [
      "x509", "-in", certificatePath, "-noout", "-subject", "-nameopt", "RFC2253", "-enddate",
      "-ext", "extendedKeyUsage",
    ], { timeout: 10_000, maxBuffer: 16_384 });
    const cn = parseCustomerAssetScanChildDatabaseCertificateRole(details.stdout);
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
      databaseCaPath,
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
