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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
const transactionKinds = new Set(["ECOMMERCE", "GENERAL"]);
const transactionStatuses = new Set(["DUE", "PARTIALLY_PAID", "PAID", "VOID", "CANCELLED"]);
const adjustmentKinds = new Set(["DISCOUNT", "TAX", "SHIPPING", "FEE", "OTHER"]);

/** Validate untrusted HTTP JSON before exposing it as a trusted snapshot. */
function isTrustedTransactionSnapshot(value: unknown): value is TrustedTransactionSnapshot {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyText(value.tenantId) || !isNonEmptyText(value.reference) ||
    !transactionKinds.has(String(value.kind)) || !isNonEmptyText(value.description) ||
    !isSafeInteger(value.amountDueMinor) || value.amountDueMinor <= 0 ||
    value.currency !== "INR" || !transactionStatuses.has(String(value.status)) ||
    !isNonEmptyText(value.sourceId) || !isNonEmptyText(value.sourceVersion) ||
    !isNonEmptyText(value.approvedAt) || !Number.isFinite(Date.parse(value.approvedAt)) ||
    !Array.isArray(value.lineItems) || !Array.isArray(value.adjustments)
  ) return false;

  for (const item of value.lineItems) {
    if (!isRecord(item) ||
      !isNonEmptyText(item.sourceLineId) || !isNonEmptyText(item.description) ||
      (item.sku !== undefined && typeof item.sku !== "string") ||
      !isSafeInteger(item.quantity) || item.quantity <= 0 ||
      !isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor < 0 ||
      !isSafeInteger(item.lineTotalMinor) || item.lineTotalMinor < 0 ||
      !Number.isSafeInteger(item.quantity * item.unitPriceMinor) ||
      item.lineTotalMinor !== item.quantity * item.unitPriceMinor
    ) return false;
  }
  for (const adjustment of value.adjustments) {
    if (!isRecord(adjustment) ||
      !adjustmentKinds.has(String(adjustment.kind)) ||
      !isNonEmptyText(adjustment.description) ||
      !isSafeInteger(adjustment.amountMinor) ||
      (adjustment.kind === "DISCOUNT" && adjustment.amountMinor >= 0)
    ) return false;
  }
  if (value.kind === "ECOMMERCE" && value.lineItems.length === 0) return false;

  // Match the shared transaction contract at the boundary: any supplied line and
  // adjustment detail must reconcile to the authoritative amount without overflow.
  const summaryOnlyGeneral =
    value.kind === "GENERAL" &&
    value.lineItems.length === 0 &&
    value.adjustments.length === 0;
  if (!summaryOnlyGeneral) {
    const lineTotal = value.lineItems.reduce((sum, item) => sum + (item as Record<string, unknown>).lineTotalMinor as number, 0);
    const adjustmentsTotal = value.adjustments.reduce((sum, item) => sum + (item as Record<string, unknown>).amountMinor as number, 0);
    const computedTotal = lineTotal + adjustmentsTotal;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(adjustmentsTotal) ||
        !Number.isSafeInteger(computedTotal) || computedTotal <= 0 ||
        computedTotal !== value.amountDueMinor) return false;
  }
  return true;
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
    if (declaredLength && /^\\d+$/.test(declaredLength) && Number(declaredLength) > maxResponseBytes) {
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
    if (!isTrustedTransactionSnapshot(value)) {
      throw new Error("EPER_TRANSACTION_AUTHORITY_RESPONSE_INVALID");
    }
    return value;
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
