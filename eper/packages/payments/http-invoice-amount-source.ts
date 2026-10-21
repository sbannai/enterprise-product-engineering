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
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("EPER_INVOICE_AUTHORITY_RESPONSE_INVALID");
    }
    return value as TrustedInvoiceAmount;
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
