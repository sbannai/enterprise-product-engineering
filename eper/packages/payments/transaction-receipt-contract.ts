/**
 * Generic, server-trusted transaction snapshot contract for payment and receipt reporting.
 *
 * The source is application-specific (e-commerce cart/order, school fee ledger,
 * service invoice, etc.). The payment/receipt layer consumes only a validated
 * immutable snapshot; it never trusts browser-supplied prices or totals.
 */
export type TransactionKind = "ECOMMERCE" | "GENERAL";
export type TransactionPayability = "DUE" | "PARTIALLY_PAID" | "PAID" | "VOID" | "CANCELLED";

export interface TrustedTransactionLineItem {
  /** Stable source identifier for this line, not a client-generated display index. */
  sourceLineId: string;
  description: string;
  sku?: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface TrustedTransactionAdjustment {
  kind: "DISCOUNT" | "TAX" | "SHIPPING" | "FEE" | "OTHER";
  description: string;
  /** Signed integer minor units; discounts are negative. */
  amountMinor: number;
}

export interface TrustedTransactionSnapshot {
  tenantId: string;
  reference: string;
  kind: TransactionKind;
  description: string;
  amountDueMinor: number;
  currency: "INR";
  status: TransactionPayability;
  lineItems: TrustedTransactionLineItem[];
  adjustments: TrustedTransactionAdjustment[];
  sourceId: string;
  sourceVersion: string;
  approvedAt: string;
}

export interface TransactionSnapshotLookup {
  tenantId: string;
  reference: string;
}

export interface TrustedTransactionSnapshotSource {
  /** Must read authoritative server-side data, never client-provided totals. */
  findTransaction(input: TransactionSnapshotLookup): Promise<TrustedTransactionSnapshot | null>;
}

export type TransactionSnapshotError =
  | "transaction_source_unavailable"
  | "transaction_not_found"
  | "transaction_tenant_mismatch"
  | "transaction_reference_mismatch"
  | "transaction_not_payable"
  | "transaction_amount_invalid"
  | "transaction_currency_unsupported"
  | "transaction_provenance_missing"
  | "transaction_description_missing"
  | "transaction_line_items_invalid"
  | "transaction_adjustments_invalid"
  | "transaction_total_mismatch";

export type TransactionSnapshotResult =
  | { ok: true; transaction: TrustedTransactionSnapshot }
  | { ok: false; error: TransactionSnapshotError };

const payable = new Set<TransactionPayability>(["DUE", "PARTIALLY_PAID"]);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isMinor = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Require a real calendar timestamp with an explicit timezone; Date.parse alone normalizes impossible dates. */
export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,9})?(?:Z|[+-](?:0\\d|1[0-4]):[0-5]\\d)$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return false;
  if (/[+-]14:(?!00)/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

/** Resolve and validate a source-owned transaction snapshot before payment-order creation. */
export async function resolveTrustedTransactionSnapshot(
  source: TrustedTransactionSnapshotSource | null | undefined,
  lookup: TransactionSnapshotLookup,
): Promise<TransactionSnapshotResult> {
  const tenantId = typeof lookup?.tenantId === "string" ? lookup.tenantId.trim() : "";
  const reference = typeof lookup?.reference === "string" ? lookup.reference.trim() : "";
  if (!source || !tenantId || !reference) return { ok: false, error: "transaction_source_unavailable" };

  let transaction: TrustedTransactionSnapshot | null;
  try {
    transaction = await source.findTransaction({ tenantId, reference });
  } catch {
    return { ok: false, error: "transaction_source_unavailable" };
  }
  if (!transaction) return { ok: false, error: "transaction_not_found" };
  if (transaction.tenantId !== tenantId) return { ok: false, error: "transaction_tenant_mismatch" };
  if (transaction.reference !== reference) return { ok: false, error: "transaction_reference_mismatch" };
  if (!payable.has(transaction.status)) return { ok: false, error: "transaction_not_payable" };
  if (!isMinor(transaction.amountDueMinor) || transaction.amountDueMinor <= 0) {
    return { ok: false, error: "transaction_amount_invalid" };
  }
  if (transaction.currency !== "INR") return { ok: false, error: "transaction_currency_unsupported" };
  if (!isText(transaction.description)) return { ok: false, error: "transaction_description_missing" };
  if (
    !isText(transaction.sourceId) || !isText(transaction.sourceVersion) ||
    !isValidIsoTimestamp(transaction.approvedAt)
  ) return { ok: false, error: "transaction_provenance_missing" };

  if (!Array.isArray(transaction.lineItems) || !Array.isArray(transaction.adjustments)) {
    return { ok: false, error: "transaction_line_items_invalid" };
  }
  if (transaction.kind !== "ECOMMERCE" && transaction.kind !== "GENERAL") {
    return { ok: false, error: "transaction_line_items_invalid" };
  }

  let lineTotal = 0;
  for (const item of transaction.lineItems) {
    const product = item?.quantity * item?.unitPriceMinor;
    if (
      !isText(item?.sourceLineId) || !isText(item?.description) ||
      (item.sku !== undefined && typeof item.sku !== "string") ||
      !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
      !isMinor(item.unitPriceMinor) || !isMinor(item.lineTotalMinor) ||
      !Number.isSafeInteger(product) ||
      item.lineTotalMinor !== product ||
      !Number.isSafeInteger(lineTotal + item.lineTotalMinor)
    ) return { ok: false, error: "transaction_line_items_invalid" };
    lineTotal += item.lineTotalMinor;
  }
  if (transaction.kind === "ECOMMERCE" && transaction.lineItems.length === 0) {
    return { ok: false, error: "transaction_line_items_invalid" };
  }

  let adjustmentsTotal = 0;
  for (const adjustment of transaction.adjustments) {
    if (
      !["DISCOUNT", "TAX", "SHIPPING", "FEE", "OTHER"].includes(adjustment?.kind) ||
      !isText(adjustment.description) ||
      !Number.isSafeInteger(adjustment.amountMinor) ||
      (adjustment.kind === "DISCOUNT" && adjustment.amountMinor >= 0) ||
      !Number.isSafeInteger(adjustmentsTotal + adjustment.amountMinor)
    ) return { ok: false, error: "transaction_adjustments_invalid" };
    adjustmentsTotal += adjustment.amountMinor;
  }
  // E-commerce snapshots must reconcile from checkout lines. A GENERAL transaction
  // may legitimately be a source-owned invoice/fee summary with no line-level detail;
  // in that case the trusted source amount is authoritative. If any detail is supplied,
  // require the supplied detail to reconcile exactly.
  const summaryOnlyGeneral =
    transaction.kind === "GENERAL" &&
    transaction.lineItems.length === 0 &&
    transaction.adjustments.length === 0;
  const computedTotal = lineTotal + adjustmentsTotal;
  if (
    !summaryOnlyGeneral &&
    (!Number.isSafeInteger(computedTotal) || computedTotal <= 0 || computedTotal !== transaction.amountDueMinor)
  ) {
    return { ok: false, error: "transaction_total_mismatch" };
  }

  // Return a detached snapshot so callers cannot mutate the source-owned arrays by reference.
  return {
    ok: true,
    transaction: {
      ...transaction,
      lineItems: transaction.lineItems.map(item => ({ ...item })),
      adjustments: transaction.adjustments.map(adjustment => ({ ...adjustment })),
    },
  };
}
