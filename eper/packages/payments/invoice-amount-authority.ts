/**
 * Trusted invoice/fee amount authority contract for payment order creation.
 *
 * This module intentionally contains no client-input or in-memory production
 * fallback. The caller must inject a trusted, tenant-scoped source backed by
 * the application's approved invoice/fee system. Until that source is wired
 * to a durable authoritative store, payment order creation must remain closed.
 */
export type InvoicePayability = "DUE" | "PARTIALLY_PAID" | "PAID" | "VOID" | "CANCELLED";

export interface TrustedInvoiceAmount {
  tenantId: string;
  /** Stable application identifier from the authoritative invoice owner. */
  applicationId: string;
  reference: string;
  amountDuePaise: number;
  currency: string;
  status: InvoicePayability;
  sourceId: string;
  sourceVersion: string;
  approvedAt: string;
}

export interface InvoiceAmountLookup {
  tenantId: string;
  reference: string;
}

export interface TrustedInvoiceAmountSource {
  /** Must read from the authoritative invoice/fee system, never client payload. */
  findInvoice(input: InvoiceAmountLookup): Promise<TrustedInvoiceAmount | null>;
}

export type InvoiceAmountAuthorityError =
  | "invoice_source_unavailable"
  | "invoice_not_found"
  | "invoice_tenant_mismatch"
  | "invoice_reference_mismatch"
  | "invoice_not_payable"
  | "invoice_amount_invalid"
  | "invoice_currency_unsupported"
  | "invoice_provenance_missing";

export type InvoiceAmountAuthorityResult =
  | { ok: true; invoice: TrustedInvoiceAmount }
  | { ok: false; error: InvoiceAmountAuthorityError };

const payableStatuses = new Set<InvoicePayability>(["DUE", "PARTIALLY_PAID"]);

/**
 * Resolve and validate the only permitted amount for a gateway order.
 * Errors are explicit so the API can fail closed without exposing invoice data.
 */
export async function resolveTrustedInvoiceAmount(
  source: TrustedInvoiceAmountSource | null | undefined,
  lookup: InvoiceAmountLookup,
): Promise<InvoiceAmountAuthorityResult> {
  const tenantId = typeof lookup?.tenantId === "string" ? lookup.tenantId.trim() : "";
  const reference = typeof lookup?.reference === "string" ? lookup.reference.trim() : "";
  if (!source || !tenantId || !reference) return { ok: false, error: "invoice_source_unavailable" };

  let invoice: TrustedInvoiceAmount | null;
  try {
    invoice = await source.findInvoice({ tenantId, reference });
  } catch {
    return { ok: false, error: "invoice_source_unavailable" };
  }
  if (!invoice) return { ok: false, error: "invoice_not_found" };
  if (invoice.tenantId !== tenantId) return { ok: false, error: "invoice_tenant_mismatch" };
  if (invoice.reference !== reference) return { ok: false, error: "invoice_reference_mismatch" };
  if (typeof invoice.applicationId !== "string" || !invoice.applicationId.trim()) return { ok: false, error: "invoice_provenance_missing" };
  if (!payableStatuses.has(invoice.status)) return { ok: false, error: "invoice_not_payable" };
  if (!Number.isSafeInteger(invoice.amountDuePaise) || invoice.amountDuePaise <= 0) {
    return { ok: false, error: "invoice_amount_invalid" };
  }
  if (invoice.currency !== "INR") return { ok: false, error: "invoice_currency_unsupported" };
  if (
    typeof invoice.sourceId !== "string" || !invoice.sourceId.trim() ||
    typeof invoice.sourceVersion !== "string" || !invoice.sourceVersion.trim() ||
    typeof invoice.approvedAt !== "string" || !invoice.approvedAt.trim() ||
    !Number.isFinite(Date.parse(invoice.approvedAt))
  ) return { ok: false, error: "invoice_provenance_missing" };

  return { ok: true, invoice: { ...invoice } };
}
