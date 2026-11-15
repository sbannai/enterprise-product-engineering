import type { Readable, Writable } from "node:stream";
import { isCustomerAssetScanChildStart } from "./customer-asset-scan-child-protocol.js";
import type { CustomerAssetScanChildRuntime } from "./customer-asset-scan-child-runtime.js";

const DEFAULT_MAX_INPUT_BYTES = 16_384;

/**
 * One-shot child stdio boundary: accepts exactly one bounded JSON start message
 * and emits exactly one allowlisted result/failure message. No diagnostics are
 * written to stdout because stdout is the machine protocol.
 */
export async function runCustomerAssetScanChildStdio(input: {
  stdin: Readable;
  stdout: Writable;
  runtime: Pick<CustomerAssetScanChildRuntime, "execute">;
  signal: AbortSignal;
  maxInputBytes?: number;
}): Promise<number> {
  const maxInputBytes = input.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 256 || maxInputBytes > 1_048_576) {
    return 2;
  }

  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for await (const chunk of input.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      received += buffer.byteLength;
      if (!Number.isSafeInteger(received) || received > maxInputBytes) return 2;
      chunks.push(buffer);
    }
  } catch {
    return 2;
  }

  let message: unknown;
  try {
    message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return 2;
  }
  if (!isCustomerAssetScanChildStart(message)) return 2;

  let response;
  try {
    response = await input.runtime.execute(message, input.signal);
  } catch {
    return 2;
  }
  const serialized = JSON.stringify(response);
  return await new Promise<number>(resolve => {
    input.stdout.write(serialized, error => resolve(error ? 2 : 0));
  });
}
