import { isAbsolute, resolve, relative, sep, join } from "node:path";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runCustomerAssetScanChild, type CustomerAssetScanChildOutcome } from "./customer-asset-scan-child-supervisor.js";
import type { CustomerAssetScanChildStart } from "./customer-asset-scan-child-protocol.js";
import { CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE } from "./customer-asset-scan-child-spiffe-identity.js";

export interface TrustedCustomerAssetScanChildConfiguration {
  workloadApiSocket: string;
  expectedSpiffeId: string;
  audience: string;
  databaseHost: string;
  databaseCaFile: string;
  databasePort: number;
  databaseName: string;
  databaseUser: string;
  compositionModulePath: string;
}

const CHILD_ENTRYPOINT = fileURLToPath(
  new URL("../../apps/worker/customer-asset-scan-child-main.js", import.meta.url),
);

// This path exists only in the dedicated scanner-worker image. Never inherit
// the API parent's Node 20 executable or accept a caller-supplied executable.
const CHILD_NODE_EXECUTABLE = "/opt/eper/node24/bin/node";

function validSpiffeId(value: string): boolean {
  if (!/^spiffe:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value)) return false;
  const path = value.slice("spiffe://".length).split("/").slice(1);
  return path.length > 0 && path.every(segment =>
    segment.length > 0 && segment !== "." && segment !== ".." && !/%2e/i.test(segment),
  );
}

/**
 * Fixed production launch boundary. Callers cannot select an executable,
 * executable, arbitrary module paths outside the deployment-owned scanner directory, Node flags,
 * or arbitrary environment variables. Credentials
 * are deliberately absent: PostgreSQL uses client-certificate authentication
 * and provider secrets are resolved inside the child through a separate port.
 */
export function buildTrustedCustomerAssetScanChildLaunch(configuration: TrustedCustomerAssetScanChildConfiguration): {
  executable: string;
  args: string[];
  environment: Record<string, string>;
} {
  const required = (value: unknown, code: string, max = 1024): string => {
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(code);
    }
    return value;
  };
  const socket = required(configuration?.workloadApiSocket, "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SOCKET_INVALID");
  if (!socket.startsWith("unix:///") || !isAbsolute(socket.slice("unix://".length)) ||
      socket.split("/").includes("..")) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SOCKET_INVALID");
  }
  const spiffeId = required(configuration.expectedSpiffeId, "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_ID_INVALID", 512);
  if (!validSpiffeId(spiffeId)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_ID_INVALID");
  }
  const audience = required(configuration.audience, "CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE_INVALID", 256);
  if (audience !== CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE_INVALID");
  }
  const host = required(configuration.databaseHost, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_HOST_INVALID", 255);
  const caFile = required(configuration.databaseCaFile, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_CA_PATH_INVALID");
  if (!isAbsolute(caFile) || caFile.split("/").includes("..")) throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_CA_PATH_INVALID");
  const name = required(configuration.databaseName, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_NAME_INVALID", 128);
  const user = required(configuration.databaseUser, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_USER_INVALID", 128);
  if (!Number.isSafeInteger(configuration.databasePort) || configuration.databasePort < 1 || configuration.databasePort > 65535) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_PORT_INVALID");
  }
  const environment = {
    EPER_SCANNER_CHILD_SPIFFE_WORKLOAD_API_SOCKET: socket,
    EPER_SCANNER_CHILD_EXPECTED_SPIFFE_ID: spiffeId,
    EPER_SCANNER_CHILD_SPIFFE_AUDIENCE: audience,
    EPER_SCANNER_CHILD_COMPOSITION_MODULE: (() => {
      const modulePath = required(configuration.compositionModulePath, "CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_PATH_INVALID");
      const root = resolve(process.cwd(), "dist/packages/assets/scanners");
      const candidate = resolve(process.cwd(), modulePath);
      const rel = relative(root, candidate);
      if (!modulePath.startsWith("./dist/packages/assets/scanners/") || !rel || rel === ".." ||
          rel.startsWith(".." + sep) || !candidate.endsWith(".js")) {
        throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_PATH_INVALID");
      }
      return candidate;
    })(),
    PGHOST: host,
    PGSSLROOTCERT: caFile,
    PGPORT: String(configuration.databasePort),
    PGDATABASE: name,
    PGUSER: user,
    PGSSLMODE: "verify-full",
  };
  return {
    executable: CHILD_NODE_EXECUTABLE,
    args: ["--disable-proto=throw", CHILD_ENTRYPOINT],
    environment,
  };
}

/** Parent-owned scratch root. The child creates its ephemeral key directory beneath
 * this path; the parent removes the whole tree only after the child process closes,
 * so SIGKILL and abrupt child exits cannot strand private keys in the shared temp dir.
 */
export async function withCustomerAssetScanChildPrivateTempDirectory<T>(
  operation: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "eper-scan-child-parent-"));
  try {
    await chmod(directory, 0o700);
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runTrustedCustomerAssetScanChild(input: {
  start: CustomerAssetScanChildStart;
  timeoutMs: number;
  configuration: TrustedCustomerAssetScanChildConfiguration;
  signal?: AbortSignal;
}): Promise<CustomerAssetScanChildOutcome> {
  const launch = buildTrustedCustomerAssetScanChildLaunch(input.configuration);
  return withCustomerAssetScanChildPrivateTempDirectory(privateTempDirectory =>
    runCustomerAssetScanChild({
      ...launch,
      environment: { ...launch.environment, TMPDIR: privateTempDirectory },
      start: input.start,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    }),
  );
}
