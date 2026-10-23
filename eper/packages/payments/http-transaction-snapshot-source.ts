import type {
  TransactionSnapshotLookup,
  TrustedTransactionSnapshot,
  TrustedTransactionSnapshotSource,
} from "./transaction-receipt-contract.js";

export interface HttpTransactionAuthorityConfig {
  endpoint: string;
  bearerToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Read-only adapter for an owner-approved transaction authority API.
 *
 * The endpoint is supplied by deployment configuration. No mock, local fixture,
 * or client-supplied amount is used as a fallback. The authority API must return
 * the TrustedTransactionSnapshot contract for the requested tenant and transaction.
 */
export class HttpTransactionSnapshotSource implements TrustedTransactionSnapshotSource {
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: HttpTransactionAuthorityConfig) {
    if (!config.bearerToken?.trim() || config.bearerToken.length < 24) {
      throw new Error("EPER_TRANSACTION_AUTHORITY_TOKEN_REQUIRED");
    }
    let endpoint: URL;
    try {
      endpoint = new URL(config.endpoint);
    } catch {
      throw new Error("EPER_TRANSACTION_AUTHORITY_URL_INVALID");
    }
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username || endpoint.password ||
      endpoint.hash || endpoint.search
    ) {
      throw new Error("EPER_TRANSACTION_AUTHORITY_URL_INVALID");
    }
    if (config.timeoutMs !== undefined &&
        (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 30_000)) {
      throw new Error("EPER_TRANSACTION_AUTHORITY_TIMEOUT_INVALID");
    }
    this.endpoint = endpoint;
    this.timeoutMs = config.timeoutMs ?? 5_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async findTransaction(input: TransactionSnapshotLookup): Promise<TrustedTransactionSnapshot | null> {
    if (!input.tenantId.trim() || !input.reference.trim()) return null;
    const url = new URL(this.endpoint.href);
    url.searchParams.set("tenantId", input.tenantId);
    url.searchParams.set("reference", input.reference);
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: "Bearer " + this.config.bearerToken,
      },
      redirect: "error",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("EPER_TRANSACTION_AUTHORITY_REQUEST_FAILED");

    // Bound untrusted upstream response bodies before JSON parsing to prevent an
    // transaction-authority outage or compromised endpoint from exhausting API memory.
    const maxResponseBytes = 64 * 1024;
    const declaredLength = response.headers.get("content-length");
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxResponseBytes) {
      await response.body?.cancel();
      throw new Error("EPER_TRANSACTION_AUTHORITY_RESPONSE_TOO_LARGE");
    }
    if (!response.body) throw new Error("EPER_TRANSACTION_AUTHORITY_RESPONSE_INVALID");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxResponseBytes) {
          await reader.cancel();
          throw new Error("EPER_TRANSACTION_AUTHORITY_RESPONSE_TOO_LARGE");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"));
    } catch {
      throw new Error("EPER_TRANSACTION_AUTHORITY_RESPONSE_INVALID");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("EPER_TRANSACTION_AUTHORITY_RESPONSE_INVALID");
    }
    return value as TrustedTransactionSnapshot;
  }
}

/** Missing endpoint/token means no adapter; callers must fail closed. */
export function createConfiguredHttpTransactionSnapshotSource(
  env: NodeJS.ProcessEnv = process.env,
): HttpTransactionSnapshotSource | undefined {
  const endpoint = env.EPER_TRANSACTION_AUTHORITY_URL?.trim();
  const bearerToken = env.EPER_TRANSACTION_AUTHORITY_TOKEN?.trim();
  if (!endpoint && !bearerToken) return undefined;
  if (!endpoint || !bearerToken) throw new Error("EPER_TRANSACTION_AUTHORITY_CONFIGURATION_INCOMPLETE");
  return new HttpTransactionSnapshotSource({ endpoint, bearerToken });
}
