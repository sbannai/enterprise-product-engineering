import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveTrustedInvoiceAmount, type TrustedInvoiceAmountSource } from "../../packages/payments/invoice-amount-authority.js";
import type { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import { resolveTrustedTransactionSnapshot, type TrustedTransactionSnapshot, type TrustedTransactionSnapshotSource } from "../../packages/payments/transaction-receipt-contract.js";

type PaymentStatus = "CREATED" | "PAID";
export type TrustedReceiptNumberSource = (input: { tenantId: string; transactionPublicId: string; providerPaymentId: string }) => Promise<string>;
interface PaymentRecord {
  id: string;
  tenantId: string;
  reference: string;
  invoiceSourceId: string;
  invoiceSourceVersion: string;
  invoiceApprovedAt: string;
  amountPaise: number;
  currency: string;
  status: PaymentStatus;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  receiptNumber?: string;
  receiptId?: string;
  createdAt: string;
  paidAt?: string;
  transactionSnapshot?: TrustedTransactionSnapshot;
}
interface Ledger { records: PaymentRecord[]; }

function json(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += part.length;
    if (size > 1024 * 1024) throw new Error("BODY_TOO_LARGE");
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}
function validSignature(expected: string, supplied: string): boolean {
  // Reject malformed/trailing input before hex decoding; Buffer.from(hex) silently truncates invalid suffixes.
  if (!/^[0-9a-f]{64}$/i.test(expected) || !/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const a = Buffer.from(expected, "hex"); const b = Buffer.from(supplied, "hex");
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}
function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "?");
}
export function receiptPdf(record: PaymentRecord): Buffer {
  const lines = [
    "EPER PAYMENT RECEIPT",
    "Receipt ID: " + (record.receiptId ?? ""),
    "Receipt number: " + (record.receiptNumber ?? ""),
    "Payment reference: " + record.reference,
    "Transaction ID: " + record.id,
    "Payment ID: " + (record.razorpayPaymentId ?? ""),
    "Amount: " + (record.amountPaise / 100).toFixed(2) + " " + record.currency,
    "Tenant: " + record.tenantId,
    "Paid at: " + (record.paidAt ?? ""),
    "Status: PAID",
    ...(record.transactionSnapshot ? [
      "Transaction type: " + record.transactionSnapshot.kind,
      "Transaction description: " + record.transactionSnapshot.description,
      ...record.transactionSnapshot.lineItems.map((item) =>
        "Item: " + item.description + " | Qty " + item.quantity + " | Unit " +
        (item.unitPriceMinor / 100).toFixed(2) + " | Total " + (item.lineTotalMinor / 100).toFixed(2)),
      ...record.transactionSnapshot.adjustments.map((item) =>
        "Adjustment: " + item.kind + " " + item.description + " " + (item.amountMinor / 100).toFixed(2)),
      "Source: " + record.transactionSnapshot.sourceId + " " + record.transactionSnapshot.sourceVersion,
    ] : []),
  ];

  // Helvetica AFM widths in 1/1000 em for printable ASCII (space through tilde).
  // Measure after pdfEscape's non-ASCII substitution so the layout matches the
  // actual bytes sent to the built-in PDF font.
  const helveticaWidths = [
    278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    222,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,
  ];
  const renderedWidth = (value: string, fontSize: number): number => {
    const printable = value.replace(/[^\x20-\x7E]/g, "?");
    let units = 0;
    for (const character of printable) {
      units += helveticaWidths[character.charCodeAt(0) - 32] ?? 1000;
    }
    return units * fontSize / 1000;
  };
  const maxTextWidth = 495; // A4 page width minus 50pt margins on both sides.
  const wrapLine = (line: string, fontSize: number): string[] => {
    const printable = line.replace(/[^\x20-\x7E]/g, "?");
    const chunks: string[] = [];
    let chunk = "";
    for (const character of printable) {
      if (chunk && renderedWidth(chunk + character, fontSize) > maxTextWidth) {
        chunks.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    if (chunk || chunks.length === 0) chunks.push(chunk);
    return chunks;
  };
  // Only the document title uses 16pt. All receipt data, including the first
  // line on subsequent pages, uses 10pt; wrap against the font size actually drawn.
  const wrappedLines = lines.flatMap((line, index) => wrapLine(line, index === 0 ? 16 : 10));

  // 27 rendered lines at 24pt spacing fit within the A4 content area.
  const linesPerPage = 27;
  const pages: string[][] = [];
  for (let i = 0; i < wrappedLines.length; i += linesPerPage) {
    pages.push(wrappedLines.slice(i, i + linesPerPage));
  }
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [" + pages.map((_, i) => (3 + i * 2) + " 0 R").join(" ") + "] /Count " + pages.length + " >>",
  ];
  for (let i = 0; i < pages.length; i++) {
    const pageObject = 3 + i * 2;
    const contentObject = pageObject + 1;
    const pageLines = pages[i];
    const firstLine = pageLines[0] ?? "";
    const titleOnFirstPage = i === 0;
    const stream = "BT /F1 " + (titleOnFirstPage ? "16" : "10") + " Tf 50 790 Td (" + pdfEscape(firstLine) + ") Tj /F1 10 Tf " +
      pageLines.slice(1).map(line => "0 -24 Td (" + pdfEscape(line) + ") Tj").join(" ") + " ET";
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 " +
      (3 + pages.length * 2) + " 0 R >> >> /Contents " + contentObject + " 0 R >>");
    objects.push("<< /Length " + Buffer.byteLength(stream, "ascii") + " >>\nstream\n" + stream + "\nendstream");
  }
  const fontObject = 3 + pages.length * 2;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += (i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n";
  }
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(pdf, "ascii");
}

async function readLedger(file: string): Promise<Ledger> {
  try {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!value || typeof value !== "object" || !Array.isArray((value as Ledger).records)) throw new Error("PAYMENT_LEDGER_INVALID");
    return value as Ledger;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [] };
    throw error;
  }
}
async function saveLedger(file: string, ledger: Ledger): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(ledger), { mode: 0o600 });
  await rename(temp, file);
}
async function safeReceiptNumber(
  source: TrustedReceiptNumberSource | undefined,
  input: { tenantId: string; transactionPublicId: string; providerPaymentId: string },
): Promise<string | null> {
  if (!source) return null;
  try {
    const value = await source(input);
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/.test(value) ? value : null;
  } catch {
    // Receipt policy is an external business dependency. A transient failure must
    // fail closed as a controlled 503, not escape the HTTP request handler.
    return null;
  }
}

function config(): { keyId: string; keySecret: string; webhookSecret: string; token: string; ledgerFile: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const token = process.env.EPER_PAYMENT_API_TOKEN ?? "";
  if (!keyId || !keySecret || !webhookSecret || token.length < 32) return null;
  return { keyId, keySecret, webhookSecret, token, ledgerFile: resolve(process.env.EPER_PAYMENT_LEDGER_FILE ?? "./data/payments.json") };
}
function configuredTenantTokens(): Record<string, string> | null {
  const raw = process.env.EPER_PAYMENT_TENANT_TOKENS ?? "";
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0 || entries.some(([tenant, token]) =>
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(tenant) || typeof token !== "string" || token.length < 32)) return null;
    return Object.fromEntries(entries) as Record<string, string>;
  } catch { return null; }
}
function authenticatedTenant(req: IncomingMessage, tokens: Record<string, string>): string | null {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  if (!match) return null;
  const supplied = Buffer.from(match[1]);
  let matched: string | null = null;
  // Compare against every configured tenant token; never fall back to the shared API token.
  for (const [tenantId, token] of Object.entries(tokens)) {
    const expected = Buffer.from(token);
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) matched = tenantId;
  }
  return matched;
}
function tenantHeaderMatches(req: IncomingMessage, tenantId: string): boolean {
  const requested = req.headers["x-tenant-id"];
  return requested === undefined || requested === tenantId;
}

/**
 * Razorpay integration. Disabled unless all secrets are configured.
 * Routes: POST /api/payments/orders, POST /api/payments/verify,
 * POST /api/payments/webhooks/razorpay, GET /api/payments/:id/receipt.pdf.
 * This ledger is single-process JSON persistence; use a transactional database
 * before horizontal scaling or high-volume production use.
 */
export async function handlePaymentRoute(req: IncomingMessage, res: ServerResponse, pathname: string, invoiceAmountSource?: TrustedInvoiceAmountSource, paymentStore?: PostgresPaymentStore, receiptNumberSource?: TrustedReceiptNumberSource, transactionSnapshotSource?: TrustedTransactionSnapshotSource): Promise<boolean> {
  if (!pathname.startsWith("/api/payments/")) return false;
  // The JSON ledger has no cross-process transaction/locking guarantees. Never enable
  // payment mutation or receipt issuance in production until a transactional store is wired.
  if (process.env.NODE_ENV === "production") {
    json(res, 503, { error: "payment_persistence_not_production_ready" });
    return true;
  }
  if (process.env.EPER_PAYMENT_PERSISTENCE === "postgres" && !paymentStore) {
    json(res, 503, { error: "payment_persistence_store_unavailable" });
    return true;
  }
  const cfg = config();
  if (!cfg) { json(res, 503, { error: "payment_gateway_unconfigured" }); return true; }

  if (req.method === "POST" && pathname === "/api/payments/webhooks/razorpay") {
    let raw: Buffer;
    try { raw = await body(req); } catch { json(res, 413, { error: "body_too_large" }); return true; }
    const signature = req.headers["x-razorpay-signature"];
    const expected = createHmac("sha256", cfg.webhookSecret).update(raw).digest("hex");
    if (typeof signature !== "string" || !validSignature(expected, signature)) { json(res, 401, { error: "invalid_webhook_signature" }); return true; }
    let event: any;
    try { event = JSON.parse(raw.toString("utf8")); } catch { json(res, 400, { error: "invalid_json" }); return true; }
    if (paymentStore && process.env.EPER_PAYMENT_PERSISTENCE === "postgres") {
      if (event?.event !== "payment.captured") { json(res, 200, { received: true, ignored: true }); return true; }
      const payment = event?.payload?.payment?.entity;
      const providerEventId = req.headers["x-razorpay-event-id"];
      if (typeof providerEventId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(providerEventId) ||
          typeof payment?.order_id !== "string" || !payment.order_id.trim() || payment.order_id !== payment.order_id.trim() ||
          typeof payment?.id !== "string" || !payment.id.trim() || payment.id !== payment.id.trim() ||
          payment.status !== "captured" || typeof payment.amount !== "number" || !Number.isSafeInteger(payment.amount) || payment.amount <= 0 || payment.currency !== "INR") {
        json(res, 400, { error: "captured_payment_event_invalid" }); return true;
      }
      const order = await paymentStore.findOrderByProviderOrderId(payment.order_id);
      if (!order) { json(res, 503, { error: "payment_order_not_persisted_retry_webhook" }); return true; }
      if (payment.amount !== order.amountMinor) { json(res, 409, { error: "gateway_payment_details_mismatch" }); return true; }
      if (order.status === "captured" && order.providerPaymentId !== payment.id) {
        json(res, 409, { error: "order_already_captured_with_different_payment" }); return true;
      }
      // For a captured order, reuse its issued receipt and snapshot without calling
      // mutable authorities. Still submit the event to capturePayment so a reused
      // provider event ID with a different payload is rejected as a conflict.
      const existingReceipt = order.status === "captured"
        ? await paymentStore.findReceipt(order.tenantId, order.id)
        : null;
      if (order.status === "captured" && !existingReceipt) {
        json(res, 503, { error: "captured_payment_receipt_missing" }); return true;
      }
      // Use the immutable snapshot captured at order creation. Do not re-read a mutable
      // invoice status here: the source may already say PAID after Razorpay captured.
      const storedSnapshot = existingReceipt?.transactionSnapshot ?? order.transactionSnapshot;
      const snapshot = await resolveTrustedTransactionSnapshot(
        storedSnapshot ? { async findTransaction() { return storedSnapshot; } } : undefined,
        { tenantId: order.tenantId, reference: order.invoiceReference },
      );
      if (!snapshot.ok) { json(res, 503, { error: "trusted_transaction_snapshot_unavailable", reason: snapshot.error }); return true; }
      if (snapshot.transaction.amountDueMinor !== payment.amount || snapshot.transaction.currency !== "INR") {
        json(res, 409, { error: "invoice_transaction_amount_currency_mismatch" }); return true;
      }
      const receiptNumber = existingReceipt?.receiptNumber ?? await safeReceiptNumber(receiptNumberSource, {
        tenantId: order.tenantId, transactionPublicId: order.transactionPublicId, providerPaymentId: payment.id,
      });
      if (!receiptNumber) { json(res, 503, { error: "receipt_number_policy_unconfigured" }); return true; }
      const result = await paymentStore.capturePayment({
        providerEventId, eventType: "payment.captured",
        payloadSha256: createHash("sha256").update(raw).digest("hex"),
        providerOrderId: payment.order_id, providerPaymentId: payment.id,
        amountMinor: payment.amount, currency: "INR", tenantId: order.tenantId, receiptNumber, transactionSnapshot: snapshot.transaction,
      });
      if (!result.ok && result.reason !== "duplicate_event") {
        json(res, result.reason === "event_conflict" ? 409 : result.reason === "payment_mismatch" ? 409 : 503, { error: result.reason }); return true;
      }
      if (!result.ok && result.reason === "duplicate_event") {
        // Idempotent webhook retries should return the already-issued receipt identity.
        const existingReceipt = await paymentStore.findReceipt(order.tenantId, order.id);
        if (!existingReceipt) {
          json(res, 503, { error: "captured_payment_receipt_missing" }); return true;
        }
        json(res, 200, {
          received: true,
          receiptId: existingReceipt.receiptPublicId,
          receiptNumber: existingReceipt.receiptNumber,
          receiptUrl: "/api/payments/receipts/" + existingReceipt.receiptPublicId + ".pdf",
          duplicate: true,
        });
        return true;
      }
      json(res, 200, { received: true, ...(result.ok ? { receiptId: result.value.receiptPublicId, receiptNumber: result.value.receiptNumber, receiptUrl: "/api/payments/receipts/" + result.value.receiptPublicId + ".pdf" } : {}) });
      return true;
    }
    if (event?.event === "payment.captured") {
      const payment = event?.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) {
        const ledger = await readLedger(cfg.ledgerFile);
        const record = ledger.records.find(item => item.razorpayOrderId === payment.order_id);
        if (record && record.status !== "PAID" && payment.status === "captured" && Number(payment.amount) === record.amountPaise && payment.currency === record.currency) {
          record.status = "PAID"; record.razorpayPaymentId = String(payment.id);
          record.receiptNumber = "EPER-" + new Date().getUTCFullYear() + "-" + randomUUID().slice(0, 8).toUpperCase();
          record.receiptId = randomUUID();
          record.paidAt = new Date().toISOString();
          await saveLedger(cfg.ledgerFile, ledger);
        }
      }
    }
    json(res, 200, { received: true }); return true;
  }

  let principalTenantId: string | null = null;
  if (process.env.EPER_PAYMENT_PERSISTENCE === "postgres") {
    const tenantTokens = configuredTenantTokens();
    if (!tenantTokens) { json(res, 503, { error: "tenant_identity_unconfigured" }); return true; }
    principalTenantId = authenticatedTenant(req, tenantTokens);
    if (!principalTenantId) { json(res, 401, { error: "unauthorized" }); return true; }
    // x-tenant-id is only an optional consistency assertion, never the identity source.
    if (!tenantHeaderMatches(req, principalTenantId)) { json(res, 403, { error: "tenant_scope_mismatch" }); return true; }
  } else {
    // The legacy single-process ledger is retained for isolated tests only; it is never production-ready.
    if (!bearer(req, cfg.token)) { json(res, 401, { error: "unauthorized" }); return true; }
    principalTenantId = typeof req.headers["x-tenant-id"] === "string" ? req.headers["x-tenant-id"] : null;
  }

  if (req.method === "POST" && pathname === "/api/payments/orders") {
    let input: any;
    try { input = JSON.parse((await body(req)).toString("utf8")); } catch { json(res, 400, { error: "invalid_json" }); return true; }
    const tenantId = typeof input?.tenantId === "string" ? input.tenantId.trim() : "";
    const reference = typeof input?.reference === "string" ? input.reference.trim() : "";
    if (!tenantId || tenantId !== principalTenantId) { json(res, 403, { error: "tenant_scope_mismatch" }); return true; }
    if (!tenantId || !reference) {
      json(res, 400, { error: "tenant_and_invoice_reference_required" }); return true;
    }
    // Never use browser-supplied amounts. Resolve from the injected tenant-scoped invoice source.
    const authority = await resolveTrustedInvoiceAmount(invoiceAmountSource, { tenantId, reference });
    if (!authority.ok) {
      const status = authority.error === "invoice_not_found" ? 404
        : authority.error === "invoice_tenant_mismatch" ? 403
        : authority.error === "invoice_not_payable" ? 409
        : authority.error === "invoice_amount_invalid" || authority.error === "invoice_currency_unsupported" || authority.error === "invoice_reference_mismatch" ? 422
        : 503;
      json(res, status, { error: authority.error }); return true;
    }
    const amountPaise = authority.invoice.amountDuePaise;
    const currency = authority.invoice.currency;
    let orderTimeTransactionSnapshot: TrustedTransactionSnapshot | undefined;

    // Durable PostgreSQL checkout requires a separately sourced transaction snapshot.
    if (paymentStore && process.env.EPER_PAYMENT_PERSISTENCE === "postgres") {
      const snapshot = await resolveTrustedTransactionSnapshot(transactionSnapshotSource, { tenantId, reference });
      if (!snapshot.ok) {
        const status = snapshot.error === "transaction_not_found" ? 404
          : snapshot.error === "transaction_tenant_mismatch" ? 403
          : snapshot.error === "transaction_not_payable" ? 409
          : snapshot.error === "transaction_amount_invalid" || snapshot.error === "transaction_currency_unsupported" ||
            snapshot.error === "transaction_reference_mismatch" || snapshot.error === "transaction_total_mismatch" ||
            snapshot.error === "transaction_line_items_invalid" || snapshot.error === "transaction_adjustments_invalid" ? 422
          : 503;
        json(res, status, { error: snapshot.error }); return true;
      }
      if (snapshot.transaction.amountDueMinor !== amountPaise || snapshot.transaction.currency !== currency) {
        json(res, 409, { error: "invoice_transaction_amount_currency_mismatch" }); return true;
      }
      orderTimeTransactionSnapshot = snapshot.transaction;
    }

    // Explicit opt-in for controlled UAT. Production remains blocked above until
    // verification, webhook capture, and durable receipt retrieval are also wired.
    if (paymentStore && process.env.EPER_PAYMENT_PERSISTENCE === "postgres") {
      if (!orderTimeTransactionSnapshot) {
        json(res, 503, { error: "trusted_transaction_snapshot_unavailable" }); return true;
      }
      const idempotencyKey = String(req.headers["idempotency-key"] ?? "").trim();
      if (!idempotencyKey || idempotencyKey.length > 200) {
        json(res, 400, { error: "valid_idempotency_key_required" }); return true;
      }
      const reservation = await paymentStore.reserveOrder({
        tenantId, invoiceReference: reference, idempotencyKey,
        amountMinor: amountPaise, currency: "INR",
        invoiceSourceId: authority.invoice.sourceId,
        invoiceSourceVersion: authority.invoice.sourceVersion,
        invoiceApprovedAt: authority.invoice.approvedAt,
        transactionSnapshot: orderTimeTransactionSnapshot,
      });
      if (!reservation.ok) {
        const status = reservation.reason === "idempotency_conflict" ? 409
          : reservation.reason === "order_creation_in_progress" ? 409
          : reservation.reason === "order_creation_reconciliation_required" ? 503
          : 500;
        json(res, status, { error: reservation.reason }); return true;
      }
      if (reservation.value.providerOrderId) {
        json(res, 200, {
          payment: {
            id: reservation.value.transactionPublicId, tenantId, reference,
            amountPaise, currency, status: "CREATED",
            razorpayOrderId: reservation.value.providerOrderId,
          },
          keyId: cfg.keyId,
        });
        return true;
      }

      let orderResponse: Response;
      try {
        orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            authorization: "Basic " + Buffer.from(cfg.keyId + ":" + cfg.keySecret).toString("base64"),
            "content-type": "application/json",
          },
          body: JSON.stringify({
            amount: amountPaise, currency,
            receipt: (tenantId + "-" + idempotencyKey).slice(0, 40),
            notes: { tenantId, reference, idempotencyKey },
          }),
        });
      } catch {
        // The provider may have received the request despite a network failure.
        // Keep the reservation; retries require reconciliation rather than another chargeable order.
        json(res, 503, { error: "gateway_order_creation_outcome_unknown" }); return true;
      }
      if (!orderResponse.ok) {
        json(res, 502, { error: "gateway_order_creation_failed" }); return true;
      }
      let order: any;
      try { order = await orderResponse.json(); } catch {
        json(res, 502, { error: "gateway_order_response_invalid" }); return true;
      }
      if (typeof order?.id !== "string" || !order.id.trim()) {
        json(res, 502, { error: "gateway_order_response_invalid" }); return true;
      }
      const completed = await paymentStore.completeOrderCreation(tenantId, idempotencyKey, order.id);
      if (!completed.ok) {
        // Do not call the provider again. The persisted reservation must be reconciled.
        json(res, 503, { error: "payment_order_persistence_reconciliation_required" }); return true;
      }
      json(res, 201, {
        payment: {
          id: completed.value.transactionPublicId, tenantId, reference,
          amountPaise, currency, status: "CREATED",
          razorpayOrderId: completed.value.providerOrderId,
        },
        keyId: cfg.keyId,
      });
      return true;
    }
    const ledger = await readLedger(cfg.ledgerFile);
    const existing = ledger.records.find(item => item.tenantId === tenantId && item.reference === reference);
    if (existing) {
      if (existing.amountPaise !== amountPaise || existing.currency !== currency) {
        json(res, 409, { error: "payment_reference_amount_currency_conflict" }); return true;
      }
      json(res, 200, { payment: existing, keyId: cfg.keyId }); return true;
    }
    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: "Basic " + Buffer.from(cfg.keyId + ":" + cfg.keySecret).toString("base64"), "content-type": "application/json" },
      body: JSON.stringify({ amount: amountPaise, currency, receipt: reference.slice(0, 40), notes: { tenantId, reference } }),
    });
    if (!orderResponse.ok) { json(res, 502, { error: "gateway_order_creation_failed" }); return true; }
    const order: any = await orderResponse.json();
    const record: PaymentRecord = { id: randomUUID(), tenantId, reference, invoiceSourceId: authority.invoice.sourceId, invoiceSourceVersion: authority.invoice.sourceVersion, invoiceApprovedAt: authority.invoice.approvedAt, amountPaise, currency, status: "CREATED", razorpayOrderId: order.id, createdAt: new Date().toISOString() };
    ledger.records.push(record); await saveLedger(cfg.ledgerFile, ledger);
    json(res, 201, { payment: record, keyId: cfg.keyId }); return true;
  }

  if (req.method === "POST" && pathname === "/api/payments/verify") {
    let input: any;
    try { input = JSON.parse((await body(req)).toString("utf8")); } catch { json(res, 400, { error: "invalid_json" }); return true; }
    const orderId = input?.razorpay_order_id;
    const paymentId = input?.razorpay_payment_id;
    const signature = input?.razorpay_signature;
    if (typeof orderId !== "string" || !orderId.trim() || orderId !== orderId.trim() || orderId.length > 200 ||
        typeof paymentId !== "string" || !paymentId.trim() || paymentId !== paymentId.trim() || paymentId.length > 200 ||
        typeof signature !== "string" || !signature || !validSignature(createHmac("sha256", cfg.keySecret).update(orderId + "|" + paymentId).digest("hex"), signature)) {
      json(res, 400, { error: "payment_signature_invalid" }); return true;
    }
    if (paymentStore && process.env.EPER_PAYMENT_PERSISTENCE === "postgres") {
      const tenantId = principalTenantId;
      const order = await paymentStore.findOrder(tenantId, orderId);
      if (!order) { json(res, 404, { error: "order_not_found" }); return true; }
      const gatewayResponse = await fetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(paymentId), {
        headers: { authorization: "Basic " + Buffer.from(cfg.keyId + ":" + cfg.keySecret).toString("base64") },
      });
      if (!gatewayResponse.ok) { json(res, 502, { error: "gateway_payment_verification_failed" }); return true; }
      const gatewayPayment: any = await gatewayResponse.json();
      if (gatewayPayment.order_id !== orderId || gatewayPayment.id !== paymentId ||
          typeof gatewayPayment.amount !== "number" || !Number.isSafeInteger(gatewayPayment.amount) ||
          gatewayPayment.amount <= 0 || gatewayPayment.amount !== order.amountMinor ||
          gatewayPayment.currency !== order.currency || gatewayPayment.status !== "captured") {
        json(res, 400, { error: "gateway_payment_details_mismatch" }); return true;
      }
      // Verification uses the order-time snapshot, not the current mutable invoice status.
      if (order.status === "captured" && order.providerPaymentId !== paymentId) {
        json(res, 409, { error: "order_already_captured_with_different_payment" }); return true;
      }
      const existingReceipt = order.status === "captured"
        ? await paymentStore.findReceipt(tenantId, order.id)
        : null;
      if (order.status === "captured" && !existingReceipt) {
        json(res, 503, { error: "captured_payment_receipt_missing" }); return true;
      }
      const storedSnapshot = existingReceipt?.transactionSnapshot ?? order.transactionSnapshot;
      const snapshot = await resolveTrustedTransactionSnapshot(
        storedSnapshot ? { async findTransaction() { return storedSnapshot; } } : undefined,
        { tenantId, reference: order.invoiceReference },
      );
      if (!snapshot.ok) { json(res, 503, { error: "trusted_transaction_snapshot_unavailable", reason: snapshot.error }); return true; }
      if (snapshot.transaction.amountDueMinor !== gatewayPayment.amount || snapshot.transaction.currency !== gatewayPayment.currency) {
        json(res, 409, { error: "invoice_transaction_amount_currency_mismatch" }); return true;
      }
      const receiptNumber = existingReceipt?.receiptNumber ?? await safeReceiptNumber(receiptNumberSource, {
        tenantId, transactionPublicId: order.transactionPublicId, providerPaymentId: paymentId,
      });
      if (!receiptNumber) { json(res, 503, { error: "receipt_number_policy_unconfigured" }); return true; }
      const captured = await paymentStore.captureVerifiedPayment({
        tenantId, providerOrderId: orderId, providerPaymentId: paymentId,
        amountMinor: order.amountMinor, currency: "INR", receiptNumber, transactionSnapshot: snapshot.transaction,
      });
      if (!captured.ok) { json(res, captured.reason === "payment_mismatch" ? 409 : 404, { error: captured.reason }); return true; }
      json(res, 200, {
        payment: { id: captured.value.transactionPublicId, tenantId, reference: order.invoiceReference,
          amountPaise: order.amountMinor, currency: order.currency, status: "PAID", razorpayOrderId: orderId,
          razorpayPaymentId: paymentId, receiptNumber: captured.value.receiptNumber, receiptId: captured.value.receiptPublicId },
        receiptUrl: "/api/payments/receipts/" + captured.value.receiptPublicId + ".pdf",
      });
      return true;
    }
    const ledger = await readLedger(cfg.ledgerFile);
    const record = ledger.records.find(item => item.razorpayOrderId === orderId);
    if (!record) { json(res, 404, { error: "order_not_found" }); return true; }
    if (principalTenantId !== record.tenantId) { json(res, 403, { error: "tenant_scope_mismatch" }); return true; }
    const gatewayResponse = await fetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(paymentId), {
      headers: { authorization: "Basic " + Buffer.from(cfg.keyId + ":" + cfg.keySecret).toString("base64") },
    });
    if (!gatewayResponse.ok) { json(res, 502, { error: "gateway_payment_verification_failed" }); return true; }
    const gatewayPayment: any = await gatewayResponse.json();
    if (gatewayPayment.order_id !== orderId || Number(gatewayPayment.amount) !== record.amountPaise || gatewayPayment.currency !== record.currency || gatewayPayment.status !== "captured") {
      json(res, 400, { error: "gateway_payment_details_mismatch" }); return true;
    }
    if (record.status !== "PAID") {
      record.status = "PAID"; record.razorpayPaymentId = paymentId;
      record.receiptNumber = "EPER-" + new Date().getUTCFullYear() + "-" + randomUUID().slice(0, 8).toUpperCase();
      record.receiptId = randomUUID();
      record.paidAt = new Date().toISOString(); await saveLedger(cfg.ledgerFile, ledger);
    } else if (record.razorpayPaymentId !== paymentId) { json(res, 409, { error: "order_already_paid_with_different_payment" }); return true; }
    json(res, 200, { payment: record, receiptUrl: "/api/payments/receipts/" + record.receiptId + ".pdf" }); return true;
  }

  const publicReceiptMatch = /^\/api\/payments\/receipts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/i.exec(pathname);
  if (req.method === "GET" && publicReceiptMatch && paymentStore && process.env.EPER_PAYMENT_PERSISTENCE === "postgres") {
    const tenantId = principalTenantId;
    let receipt = await paymentStore.findReceiptByPublicId(tenantId, publicReceiptMatch[1]);
    if (!receipt) { json(res, 404, { error: "receipt_not_found" }); return true; }
    const order = await paymentStore.findOrderByInternalId(tenantId, receipt.orderId);
    if (!order || order.status !== "captured" || !order.providerPaymentId) { json(res, 409, { error: "receipt_available_only_after_verified_payment" }); return true; }
    let pdf = receipt.documentPdf;
    if (!pdf) {
      // Never mint a canonical historical receipt without its persisted immutable
      // transaction snapshot. Mutable invoice/cart sources are not recovery evidence.
      if (!receipt.transactionSnapshot) {
        json(res, 503, { error: "trusted_transaction_snapshot_unavailable" });
        return true;
      }
      pdf = receiptPdf({
        id: order.transactionPublicId, tenantId, reference: order.invoiceReference,
        invoiceSourceId: "", invoiceSourceVersion: "", invoiceApprovedAt: "",
        amountPaise: order.amountMinor, currency: order.currency, status: "PAID",
        razorpayOrderId: order.providerOrderId, razorpayPaymentId: order.providerPaymentId,
        receiptNumber: receipt.receiptNumber, receiptId: receipt.receiptPublicId,
        createdAt: order.createdAt, paidAt: receipt.issuedAt,
        transactionSnapshot: receipt.transactionSnapshot ?? undefined,
      });
      const persisted = await paymentStore.persistReceiptDocument(tenantId, order.id, pdf);
      if (!persisted.ok) { json(res, 503, { error: "receipt_document_persistence_failed" }); return true; }
      const stored = await paymentStore.findReceipt(tenantId, order.id);
      if (!stored?.documentPdf || stored.receiptPublicId !== receipt.receiptPublicId) {
        json(res, 503, { error: "receipt_document_persistence_failed" }); return true;
      }
      receipt = stored;
      pdf = stored.documentPdf;
    }
    const actualDigest = createHash("sha256").update(pdf).digest("hex");
    if (!receipt.documentSha256 || !/^[a-f0-9]{64}$/i.test(receipt.documentSha256) ||
        actualDigest !== receipt.documentSha256.toLowerCase()) {
      json(res, 503, { error: "receipt_document_integrity_failed" }); return true;
    }
    res.writeHead(200, { "content-type": "application/pdf", "content-disposition": 'attachment; filename="' + receipt.receiptPublicId + '.pdf"', "content-length": pdf.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(pdf); return true;
  }

  if (req.method === "GET" && publicReceiptMatch) {
    const ledger = await readLedger(cfg.ledgerFile);
    const record = ledger.records.find(item => item.receiptId === publicReceiptMatch[1]);
    if (!record) { json(res, 404, { error: "receipt_not_found" }); return true; }
    if (principalTenantId !== record.tenantId) { json(res, 403, { error: "tenant_scope_mismatch" }); return true; }
    if (record.status !== "PAID") { json(res, 409, { error: "receipt_available_only_after_verified_payment" }); return true; }
    const pdf = receiptPdf(record);
    res.writeHead(200, { "content-type": "application/pdf", "content-disposition": 'attachment; filename="' + record.receiptId + '.pdf"', "content-length": pdf.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(pdf); return true;
  }

  const receiptMatch = /^\/api\/payments\/([^/]+)\/receipt\.pdf$/.exec(pathname);
  if (req.method === "GET" && receiptMatch && process.env.EPER_PAYMENT_PERSISTENCE === "postgres") {
    json(res, 410, { error: "legacy_receipt_route_disabled_in_postgres_mode" });
    return true;
  }
  if (req.method === "GET" && receiptMatch) {
    const ledger = await readLedger(cfg.ledgerFile);
    const record = ledger.records.find(item => item.id === decodeURIComponent(receiptMatch[1]));
    if (!record) { json(res, 404, { error: "payment_not_found" }); return true; }
    if (principalTenantId !== record.tenantId) { json(res, 403, { error: "tenant_scope_mismatch" }); return true; }
    if (record.status !== "PAID") { json(res, 409, { error: "receipt_available_only_after_verified_payment" }); return true; }
    if (!record.receiptId) { record.receiptId = randomUUID(); await saveLedger(cfg.ledgerFile, ledger); }
    const pdf = receiptPdf(record);
    res.writeHead(200, { "content-type": "application/pdf", "content-disposition": 'attachment; filename="' + record.receiptId + '.pdf"', "content-length": pdf.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(pdf); return true;
  }

  json(res, 404, { error: "payment_route_not_found" }); return true;
}
