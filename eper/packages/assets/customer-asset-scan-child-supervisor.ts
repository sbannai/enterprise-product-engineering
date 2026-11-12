import { spawn, type ChildProcess } from "node:child_process";
import {
  isCustomerAssetScanChildFailure,
  isCustomerAssetScanChildResult,
  isCustomerAssetScanChildStart,
  type CustomerAssetScanChildFailure,
  type CustomerAssetScanChildResult,
  type CustomerAssetScanChildStart,
} from "./customer-asset-scan-child-protocol.js";

export interface CustomerAssetScanChildSupervisorOptions {
  executable: string;
  args: string[];
  start: CustomerAssetScanChildStart;
  timeoutMs: number;
  maxOutputBytes?: number;
  environment?: Record<string, string>;
  signal?: AbortSignal;
}

export type CustomerAssetScanChildOutcome =
  | { kind: "result"; value: CustomerAssetScanChildResult }
  | { kind: "failure"; value: CustomerAssetScanChildFailure };

const MAX_TIMEOUT_MS = 900_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16_384;

/**
 * Runs one scanner attempt in a killable OS process. The caller supplies an
 * explicit environment allowlist; this module never copies process.env.
 * The child receives one JSON start message on stdin and must emit exactly one
 * validated result/failure JSON message on stdout. stderr is deliberately not
 * surfaced because provider diagnostics may contain secrets or customer data.
 */
export async function runCustomerAssetScanChild(
  options: CustomerAssetScanChildSupervisorOptions,
): Promise<CustomerAssetScanChildOutcome> {
  if (!options.executable || !Array.isArray(options.args) ||
      !isCustomerAssetScanChildStart(options.start) ||
      !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 ||
      options.timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_OPTIONS_INVALID");
  }
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 256 || maxOutputBytes > 1_048_576) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_OUTPUT_LIMIT_INVALID");
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.environment ?? {})) {
    if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(key) ||
        /(?:DATABASE|DB_URL|PASSWORD|PRIVATE_KEY|SECRET)/.test(key) ||
        /^(?:NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|OPENSSL_CONF|OPENSSL_MODULES|SSLKEYLOGFILE|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_INSERT_LIBRARIES|DYLD_LIBRARY_PATH)$/.test(key) ||
        key.startsWith("DYLD_") || typeof value !== "string" || value.length > 4096) {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_ENVIRONMENT_INVALID");
    }
    env[key] = value;
  }

  const child = spawn(options.executable, options.args, {
    env,
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  return supervise(child, options.start, options.timeoutMs, maxOutputBytes, options.signal);
}

function supervise(
  child: ChildProcess,
  start: CustomerAssetScanChildStart,
  timeoutMs: number,
  maxOutputBytes: number,
  signal?: AbortSignal,
): Promise<CustomerAssetScanChildOutcome> {
  return new Promise((resolve, reject) => {
    let output = "";
    let outputBytes = 0;
    let settled = false;
    let timedOut = false;
    let overflowed = false;
    let aborted = signal?.aborted ?? false;
    const finish = (error?: Error, value?: CustomerAssetScanChildOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortChild);
      if (error) reject(error);
      else resolve(value!);
    };
    const abortChild = () => {
      aborted = true;
      child.kill("SIGKILL");
    };
    if (aborted) child.kill("SIGKILL");
    else signal?.addEventListener("abort", abortChild, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.once("error", () => finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_SPAWN_FAILED")));
    // A child may exit before consuming its one-shot request. Handle EPIPE and
    // stdout stream errors explicitly; let the process close event settle the
    // attempt so a started child is never mistaken for an exited child.
    child.stdin?.on("error", () => {
      child.kill("SIGKILL");
    });
    child.stdout?.on("error", () => {
      child.kill("SIGKILL");
    });
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += buffer.length;
      if (outputBytes > maxOutputBytes) {
        overflowed = true;
        child.kill("SIGKILL");
        return;
      }
      output += buffer.toString("utf8");
    });
    child.once("close", (code, signal) => {
      if (aborted) return finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_ABORTED"));
      if (timedOut) return finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_TIMEOUT"));
      if (overflowed) return finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_OUTPUT_LIMIT"));
      if (code !== 0 || signal !== null) return finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_EXITED"));
      let message: unknown;
      try {
        message = JSON.parse(output);
      } catch {
        return finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_INVALID"));
      }
      if (isCustomerAssetScanChildResult(message) &&
          message.jobToken === start.jobToken &&
          message.claimGeneration === start.claimGeneration &&
          message.scannerServiceId === start.scannerServiceId) {
        return finish(undefined, { kind: "result", value: message });
      }
      if (isCustomerAssetScanChildFailure(message) &&
          message.jobToken === start.jobToken &&
          message.claimGeneration === start.claimGeneration) {
        return finish(undefined, { kind: "failure", value: message });
      }
      return finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_INVALID"));
    });

    child.stdin?.end(JSON.stringify(start));
  });
}
