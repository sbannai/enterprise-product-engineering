import { createRequire } from "node:module";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE } from "../../packages/assets/customer-asset-scan-child-spiffe-identity.js";
import { CustomerAssetScanChildRuntime, type CustomerAssetScanChildRuntimeDependencies } from "../../packages/assets/customer-asset-scan-child-runtime.js";
import {
  isCustomerAssetScanChildStart,
  type CustomerAssetScanChildFailure,
} from "../../packages/assets/customer-asset-scan-child-protocol.js";

const MAX_INPUT_BYTES = 16_384;
const MAX_TIMEOUT_MS = 900_000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + "_REQUIRED");
  return value;
}
function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^[0-9]+$/.test(raw.trim())) throw new Error(name + "_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(name + "_OUT_OF_RANGE");
  return value;
}
function resolveCompositionPath(value: string): string {
  const root = resolve(process.cwd(), "dist/packages/assets/scanners");
  const candidate = resolve(process.cwd(), value);
  const rel = relative(root, candidate);
  if (!isAbsolute(value) || !rel || rel === ".." || rel.startsWith(".." + sep) || !candidate.endsWith(".js")) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_PATH_INVALID");
  }
  return candidate;
}
async function readStartMessage(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_INPUT_BYTES) throw new Error("CUSTOMER_ASSET_SCAN_CHILD_INPUT_TOO_LARGE");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function readDeploymentFile(path: string, privateKey = false): Promise<string> {
  if (!isAbsolute(path) || path.split("/").includes("..")) throw new Error("CUSTOMER_ASSET_SCAN_CHILD_CERTIFICATE_PATH_INVALID");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    // Open without following the final symlink, then validate and read the
    // same descriptor. This prevents replacing a checked certificate/key path.
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile() ||
        (metadata.mode & (privateKey ? 0o077 : 0o022)) !== 0 ||
        metadata.size < 1 || metadata.size > 1_048_576) {
      throw new Error("unsafe deployment file");
    }
    return await handle.readFile("utf8");
  } catch {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_CERTIFICATE_FILE_INVALID");
  } finally {
    await handle?.close();
  }
}
function emitFailure(start: unknown, code: CustomerAssetScanChildFailure["code"]): void {
  const candidate = start && typeof start === "object" ? start as Record<string, unknown> : {};
  const jobToken = typeof candidate.jobToken === "string" ? candidate.jobToken : "invalid";
  const claimGeneration = Number.isSafeInteger(candidate.claimGeneration) ? candidate.claimGeneration as number : 1;
  process.stdout.write(JSON.stringify({
    version: 3, type: "failure", jobToken, claimGeneration, code,
  }));
}

const protocolWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: string | Uint8Array) => {
  process.stderr.write(chunk);
  return true;
}) as typeof process.stdout.write;
console.log = console.error;
console.info = console.error;
console.debug = console.error;

const start = await readStartMessage();
if (!isCustomerAssetScanChildStart(start)) {
  emitFailure(start, "SCANNER_BOOTSTRAP_FAILED");
  process.exitCode = 1;
} else {
  let pool: { end(): Promise<void> } | undefined;
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());
  try {
    if (required("EPER_SCANNER_CHILD_SPIFFE_AUDIENCE") !== CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE) {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE_INVALID");
    }
    const compositionPath = resolveCompositionPath(required("EPER_SCANNER_CHILD_COMPOSITION_MODULE"));
    const compositionMetadata = await lstat(compositionPath);
    if (!compositionMetadata.isFile() || compositionMetadata.isSymbolicLink() ||
        (compositionMetadata.mode & 0o022) !== 0 || compositionMetadata.size < 1 || compositionMetadata.size > 1_048_576) {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_FILE_INVALID");
    }
    const require = createRequire(import.meta.url);
    const pg = require("pg") as { Pool: new (options: Record<string, unknown>) => {
      end(): Promise<void>;
      query<T extends Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
    }};
    const databasePort = boundedInteger("PGPORT", 5432, 1, 65535);
    const ca = await readDeploymentFile(required("PGSSLROOTCERT"));
    const cert = await readDeploymentFile(required("PGSSLCERT"));
    const key = await readDeploymentFile(required("PGSSLKEY"), true);
    const createdPool = new pg.Pool({
      host: required("PGHOST"), port: databasePort, database: required("PGDATABASE"),
      user: required("PGUSER"), max: 2, connectionTimeoutMillis: 5000,
      statement_timeout: 15000, query_timeout: 20000, application_name: "eper-asset-scan-child",
      ssl: { ca, cert, key, rejectUnauthorized: true },
    });
    pool = createdPool;
    const module = await import(pathToFileURL(compositionPath).href) as {
      createCustomerAssetScanChildRuntimeDependencies?: (input: {
        pool: typeof createdPool; env: NodeJS.ProcessEnv;
      }) => Promise<CustomerAssetScanChildRuntimeDependencies> | CustomerAssetScanChildRuntimeDependencies;
    };
    if (typeof module.createCustomerAssetScanChildRuntimeDependencies !== "function") {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_FACTORY_REQUIRED");
    }
    const dependencies = await module.createCustomerAssetScanChildRuntimeDependencies({ pool: createdPool, env: process.env });
    if (!dependencies || !dependencies.identity || !dependencies.input || !dependencies.provider ||
        !dependencies.scanner) throw new Error("CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_INVALID");
    const runtime = new CustomerAssetScanChildRuntime(dependencies);
    const timeoutMs = boundedInteger("EPER_SCANNER_CHILD_TIMEOUT_MS", 120_000, 1_000, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await runtime.execute(start, controller.signal);
      protocolWrite(JSON.stringify(result));
      if (result.type === "failure") process.exitCode = 1;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    emitFailure(start, "SCANNER_BOOTSTRAP_FAILED");
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end().catch(() => undefined);
  }
}
