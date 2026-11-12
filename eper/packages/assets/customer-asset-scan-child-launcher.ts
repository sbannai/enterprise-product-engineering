import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { runCustomerAssetScanChild, type CustomerAssetScanChildOutcome } from "./customer-asset-scan-child-supervisor.js";
import type { CustomerAssetScanChildStart } from "./customer-asset-scan-child-protocol.js";

export interface TrustedCustomerAssetScanChildConfiguration {
  workloadApiSocket: string;
  expectedSpiffeId: string;
  audience: string;
  databaseHost: string;
  databasePort: number;
  databaseName: string;
  databaseUser: string;
  databaseCaFile: string;
  databaseClientCertificateFile: string;
  databaseClientKeyFile: string;
}

const CHILD_ENTRYPOINT = fileURLToPath(
  new URL("../../apps/worker/customer-asset-scan-child-main.js", import.meta.url),
);

/**
 * Fixed production launch boundary. Callers cannot select an executable,
 * module path, Node flags, or arbitrary environment variables. Credentials
 * are deliberately absent: PostgreSQL uses client-certificate authentication
 * and provider secrets are resolved inside the child through a separate port.
 */
export function buildTrustedCustomerAssetScanChildLaunch(configuration: TrustedCustomerAssetScanChildConfiguration): {
  executable: string;
  args: string[];
  environment: Record<string, string>;
} {
  const required = (value: unknown, code: string, max = 1024): string => {
    if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\\0")) {
      throw new Error(code);
    }
    return value;
  };
  const socket = required(configuration?.workloadApiSocket, "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SOCKET_INVALID");
  if (!socket.startsWith("unix:///") || !isAbsolute(socket.slice("unix://".length))) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_SOCKET_INVALID");
  }
  const spiffeId = required(configuration.expectedSpiffeId, "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_ID_INVALID", 512);
  if (!/^spiffe:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(spiffeId)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_ID_INVALID");
  }
  const audience = required(configuration.audience, "CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE_INVALID", 256);
  const host = required(configuration.databaseHost, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_HOST_INVALID", 255);
  const name = required(configuration.databaseName, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_NAME_INVALID", 128);
  const user = required(configuration.databaseUser, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_USER_INVALID", 128);
  if (!Number.isSafeInteger(configuration.databasePort) || configuration.databasePort < 1 || configuration.databasePort > 65535) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_PORT_INVALID");
  }
  const absoluteFile = (value: string, code: string) => {
    const result = required(value, code);
    if (!isAbsolute(result)) throw new Error(code);
    return result;
  };
  const environment = {
    EPER_SCANNER_CHILD_SPIFFE_WORKLOAD_API_SOCKET: socket,
    EPER_SCANNER_CHILD_EXPECTED_SPIFFE_ID: spiffeId,
    EPER_SCANNER_CHILD_SPIFFE_AUDIENCE: audience,
    PGHOST: host,
    PGPORT: String(configuration.databasePort),
    PGDATABASE: name,
    PGUSER: user,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: absoluteFile(configuration.databaseCaFile, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_CA_PATH_INVALID"),
    PGSSLCERT: absoluteFile(configuration.databaseClientCertificateFile, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_CERT_PATH_INVALID"),
    PGSSLKEY: absoluteFile(configuration.databaseClientKeyFile, "CUSTOMER_ASSET_SCAN_CHILD_DATABASE_KEY_PATH_INVALID"),
  };
  return {
    executable: process.execPath,
    args: ["--disable-proto=throw", CHILD_ENTRYPOINT],
    environment,
  };
}

export async function runTrustedCustomerAssetScanChild(input: {
  start: CustomerAssetScanChildStart;
  timeoutMs: number;
  configuration: TrustedCustomerAssetScanChildConfiguration;
  signal?: AbortSignal;
}): Promise<CustomerAssetScanChildOutcome> {
  const launch = buildTrustedCustomerAssetScanChildLaunch(input.configuration);
  return runCustomerAssetScanChild({
    ...launch,
    start: input.start,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });
}
