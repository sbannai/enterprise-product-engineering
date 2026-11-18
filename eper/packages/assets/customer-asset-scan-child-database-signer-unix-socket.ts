import { createConnection, createServer, type Server, type Socket } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import type {
  CustomerAssetScanChildClientCertificateSigner,
} from "./customer-asset-scan-child-database-credential-issuer.js";

const MAX_REQUEST_BYTES = 96 * 1024;
const MAX_RESPONSE_BYTES = 80 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;

export interface CustomerAssetScanChildSignerUnixSocketOptions {
  readonly socketPath: string;
  readonly timeoutMs?: number;
}

function validSocketPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") &&
    value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value) &&
    !value.split("/").includes("..");
}

function validTimeout(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 100 && value <= 30_000;
}

function safeErrorResponse(): string {
  return JSON.stringify({ ok: false, error: "SIGNER_UNAVAILABLE" }) + "\n";
}

/**
 * Scanner-side client. The only request fields crossing the Unix socket are
 * the CSR and opaque JWT-SVID. The scanner cannot supply role or expiry.
 */
export class CustomerAssetScanChildUnixSocketCertificateSigner
implements CustomerAssetScanChildClientCertificateSigner {
  private readonly timeoutMs: number;

  constructor(private readonly options: CustomerAssetScanChildSignerUnixSocketOptions) {
    if (!validSocketPath(options.socketPath)) {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_SOCKET_INVALID");
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!validTimeout(this.timeoutMs)) {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_TIMEOUT_INVALID");
    }
  }

  sign(input: { readonly csrPem: string; readonly workloadJwtSvid: string }): Promise<string> {
    const request = JSON.stringify({
      csrPem: input?.csrPem,
      workloadJwtSvid: input?.workloadJwtSvid,
    }) + "\n";
    if (Buffer.byteLength(request, "utf8") > MAX_REQUEST_BYTES) {
      return Promise.reject(new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_REQUEST_TOO_LARGE"));
    }
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.options.socketPath);
      let response = "";
      let settled = false;
      const finish = (error?: Error, certificate?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(certificate!);
      };
      socket.setTimeout(this.timeoutMs, () =>
        finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_TIMEOUT")));
      socket.once("error", () =>
        finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_UNAVAILABLE")));
      socket.on("data", chunk => {
        response += chunk.toString("utf8");
        if (Buffer.byteLength(response, "utf8") > MAX_RESPONSE_BYTES) {
          finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_RESPONSE_TOO_LARGE"));
          return;
        }
        const newline = response.indexOf("\n");
        if (newline < 0) return;
        if (newline !== response.length - 1) {
          finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_PROTOCOL_ERROR"));
          return;
        }
        try {
          const result = JSON.parse(response.slice(0, newline)) as {
            ok?: boolean; certificatePem?: string;
          };
          if (result.ok !== true || typeof result.certificatePem !== "string" ||
              !result.certificatePem.includes("-----BEGIN CERTIFICATE-----") ||
              !result.certificatePem.includes("-----END CERTIFICATE-----")) {
            finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED"));
            return;
          }
          finish(undefined, result.certificatePem);
        } catch {
          finish(new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_PROTOCOL_ERROR"));
        }
      });
      socket.once("connect", () => socket.write(request));
    });
  }
}

/**
 * Signer-side Unix socket listener. Place the socket in a private directory
 * shared only with the scanner child; mode 0660 is applied after bind. JWT-SVID
 * validation remains mandatory in the signer policy behind this listener.
 */
export async function listenCustomerAssetScanChildSignerUnixSocket(input: {
  readonly socketPath: string;
  readonly signer: CustomerAssetScanChildClientCertificateSigner;
  readonly timeoutMs?: number;
}): Promise<{ close(): Promise<void> }> {
  if (!validSocketPath(input.socketPath)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_SOCKET_INVALID");
  }
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!validTimeout(timeoutMs)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_TIMEOUT_INVALID");
  }

  const server: Server = createServer((socket: Socket) => {
    socket.setTimeout(timeoutMs);
    let request = "";
    let processing = false;
    let handled = false;
    const respond = (payload: string) => {
      if (handled) return;
      handled = true;
      socket.end(payload);
    };
    socket.on("timeout", () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.on("data", async chunk => {
      if (handled || processing) return;
      request += chunk.toString("utf8");
      if (Buffer.byteLength(request, "utf8") > MAX_REQUEST_BYTES) {
        respond(safeErrorResponse());
        return;
      }
      const newline = request.indexOf("\n");
      if (newline < 0) return;
      if (newline !== request.length - 1) {
        respond(safeErrorResponse());
        return;
      }
      // Lock this connection before the asynchronous signer call. Additional
      // chunks must never trigger a second certificate issuance.
      processing = true;
      try {
        const parsed = JSON.parse(request.slice(0, newline)) as {
          csrPem?: unknown; workloadJwtSvid?: unknown;
        };
        if (typeof parsed.csrPem !== "string" ||
            typeof parsed.workloadJwtSvid !== "string" ||
            Object.keys(parsed).some(key => !["csrPem", "workloadJwtSvid"].includes(key))) {
          respond(safeErrorResponse());
          return;
        }
        const certificatePem = await input.signer.sign({
          csrPem: parsed.csrPem,
          workloadJwtSvid: parsed.workloadJwtSvid,
        });
        respond(JSON.stringify({ ok: true, certificatePem }) + "\n");
      } catch {
        respond(safeErrorResponse());
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  try {
    await chmod(input.socketPath, 0o660);
  } catch (error) {
    await new Promise<void>(resolve => server.close(() => resolve()));
    throw error;
  }
  return {
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
      await unlink(input.socketPath).catch(() => undefined);
    },
  };
}
