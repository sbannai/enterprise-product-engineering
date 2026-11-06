import type {
  InvoiceAmountLookup,
  TrustedInvoiceAmount,
  TrustedInvoiceAmountSource,
} from "./invoice-amount-authority.js";

export interface HttpInvoiceAuthorityConfig {
  endpoint: string;
  bearerToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Read-only adapter for an owner-approved invoice/fee authority API.
 *
 * The endpoint is supplied by deployment configuration. No mock, local fixture,
 * or client-supplied amount is used as a fallback. The authority API must return
 * the TrustedInvoiceAmount contract for the requested tenant and invoice.
 */
export class HttpInvoiceAmountSource implements TrustedInvoiceAmountSource {
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: HttpInvoiceAuthorityConfig) {
    if (!config.bearerToken?.trim() || config.bearerToken.length < 24) {
      throw new Error("EPER_INVOICE_AUTHORITY_TOKEN_REQUIRED");
    }
    let endpoint: URL;
    try {
      endpoint = new URL(config.endpoint);
    } catch {
      throw new Error("EPER_INVOICE_AUTHORITY_URL_INVALID");
    }
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username || endpoint.password ||
      endpoint.hash || endpoint.search
    ) {
      throw new Error("EPER_INVOICE_AUTHORITY_URL_INVALID");
    }
    if (config.timeoutMs !== undefined &&
        (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 30_000)) {
      throw new Error("EPER_INVOICE_AUTHORITY_TIMEOUT_INVALID");
    }
    this.endpoint = endpoint;
    this.timeoutMs = config.timeoutMs ?? 5_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async findInvoice(input: InvoiceAmountLookup): Promise<TrustedInvoiceAmount | null> {
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
    if (!response.ok) throw new Error("EPER_INVOICE_AUTHORITY_REQUEST_FAILED");

    // Bound untrusted upstream response bodies before JSON parsing to prevent an
    // invoice-authority outage or compromised endpoint from exhausting API memory.
    const maxResponseBytes = 64 * 1024;
    const declaredLength = response.headers.get("content-length");
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxResponseBytes) {
      await response.body?.cancel();
      throw new Error("EPER_INVOICE_AUTHORITY_RESPONSE_TOO_LARGE");
    }
    if (!response.body) throw new Error("EPER_INVOICE_AUTHORITY_RESPONSE_INVALID");
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
          throw new Error("EPER_INVOICE_AUTHORITY_RESPONSE_TOO_LARGE");
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
      throw new Error("EPER_INVOICE_AUTHORITY_RESPONSE_INVALID");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("EPER_INVOICE_AUTHORITY_RESPONSE_INVALID");
    }
    const invoice = value as Record<string, unknown>;
    const validStatuses = new Set(["DUE", "PARTIALLY_PAID", "PAID", "VOID", "CANCELLED"]);
    if (
      typeof invoice.tenantId !== "string" || !invoice.tenantId.trim() ||
      typeof invoice.reference !== "string" || !invoice.reference.trim() ||
      typeof invoice.applicationId !== "string" || !invoice.applicationId.trim() ||
      !Number.isSafeInteger(invoice.amountDuePaise) || (invoice.amountDuePaise as number) <= 0 ||
      typeof invoice.currency !== "string" || !invoice.currency.trim() ||
      typeof invoice.status !== "string" || !validStatuses.has(invoice.status) ||
      typeof invoice.sourceId !== "string" || !invoice.sourceId.trim() ||
      typeof invoice.sourceVersion !== "string" || !invoice.sourceVersion.trim() ||
      typeof invoice.approvedAt !== "string" || !invoice.approvedAt.trim() ||
      !Number.isFinite(Date.parse(invoice.approvedAt))
    ) {
      throw new Error("EPER_INVOICE_AUTHORITY_RESPONSE_INVALID");
    }
    return invoice as unknown as TrustedInvoiceAmount;
  }
}

/** Missing endpoint/token means no adapter; callers must fail closed. */
export function createConfiguredHttpInvoiceAmountSource(
  env: NodeJS.ProcessEnv = process.env,
): HttpInvoiceAmountSource | undefined {
  const endpoint = env.EPER_INVOICE_AUTHORITY_URL?.trim();
  const bearerToken = env.EPER_INVOICE_AUTHORITY_TOKEN?.trim();
  if (!endpoint && !bearerToken) return undefined;
  if (!endpoint || !bearerToken) throw new Error("EPER_INVOICE_AUTHORITY_CONFIGURATION_INCOMPLETE");
  return new HttpInvoiceAmountSource({ endpoint, bearerToken });
}
