import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

type PaymentStatus = "CREATED" | "PAID";
interface PaymentRecord {
  id: string;
  tenantId: string;
  reference: string;
  amountPaise: number;
  currency: string;
  status: PaymentStatus;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  receiptNumber?: string;
  createdAt: string;
  paidAt?: string;
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
function receiptPdf(record: PaymentRecord): Buffer {
  const lines = [
    "EPER PAYMENT RECEIPT",
    "Receipt: " + (record.receiptNumber ?? ""),
    "Payment reference: " + record.reference,
    "Payment ID: " + (record.razorpayPaymentId ?? ""),
    "Amount: " + (record.amountPaise / 100).toFixed(2) + " " + record.currency,
    "Tenant: " + record.tenantId,
    "Paid at: " + (record.paidAt ?? ""),
    "Status: PAID",
  ];
  const stream = "BT /F1 16 Tf 50 790 Td (" + pdfEscape(lines[0]) + ") Tj /F1 10 Tf " +
    lines.slice(1).map(line => "0 -24 Td (" + pdfEscape(line) + ") Tj").join(" ") + " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(stream, "ascii") + " >>\nstream\n" + stream + "\nendstream",
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf, "ascii")); pdf += (i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n"; }
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
function config(): { keyId: string; keySecret: string; webhookSecret: string; token: string; ledgerFile: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const token = process.env.EPER_PAYMENT_API_TOKEN ?? "";
  if (!keyId || !keySecret || !webhookSecret || token.length < 32) return null;
  return { keyId, keySecret, webhookSecret, token, ledgerFile: resolve(process.env.EPER_PAYMENT_LEDGER_FILE ?? "./data/payments.json") };
}
function tenantMatches(req: IncomingMessage, tenantId: string): boolean { return req.headers["x-tenant-id"] === tenantId; }
function bearer(req: IncomingMessage, token: string): boolean {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  if (!match) return false;
  const a = Buffer.from(match[1]); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Razorpay integration. Disabled unless all secrets are configured.
 * Routes: POST /api/payments/orders, POST /api/payments/verify,
 * POST /api/payments/webhooks/razorpay, GET /api/payments/:id/receipt.pdf.
 * This ledger is single-process JSON persistence; use a transactional database
 * before horizontal scaling or high-volume production use.
 */
export async function handlePaymentRoute(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith("/api/payments/")) return false;
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
    if (event?.event === "payment.captured") {
      const payment = event?.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) {
        const ledger = await readLedger(cfg.ledgerFile);
        const record = ledger.records.find(item => item.razorpayOrderId === payment.order_id);
        if (record && record.status !== "PAID" && Number(payment.amount) === record.amountPaise && payment.currency === record.currency) {
          record.status = "PAID"; record.razorpayPaymentId = String(payment.id);
          record.receiptNumber = "EPER-" + new Date().getUTCFullYear() + "-" + randomUUID().slice(0, 8).toUpperCase();
          record.paidAt = new Date().toISOString();
          await saveLedger(cfg.ledgerFile, ledger);
        }
      }
    }
    json(res, 200, { received: true }); return true;
  }

  if (!bearer(req, cfg.token)) { json(res, 401, { error: "unauthorized" }); return true; }

  if (req.method === "POST" && pathname === "/api/payments/orders") {
    let input: any;
    try { input = JSON.parse((await body(req)).toString("utf8")); } catch { json(res, 400, { error: "invalid_json" }); return true; }
    const tenantId = typeof input?.tenantId === "string" ? input.tenantId.trim() : "";
    const reference = typeof input?.reference === "string" ? input.reference.trim() : "";
    if (!tenantId || !tenantMatches(req, tenantId)) { json(res, 403, { error: "tenant_scope_mismatch" }); return true; }
    const amountPaise = input?.amountPaise;
    const currency = typeof input?.currency === "string" ? input.currency.toUpperCase() : "INR";
    // Payment amount must come from a trusted server-side invoice/fee source, not an arbitrary client value.
    if (process.env.NODE_ENV === "production" || process.env.EPER_PAYMENT_ALLOW_CLIENT_AMOUNT !== "true") {
      json(res, 503, { error: "server_side_amount_authority_required" }); return true;
    }
    if (!tenantId || !reference || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || currency !== "INR") {
      json(res, 400, { error: "tenant_reference_positive_amount_paise_and_inr_required" }); return true;
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
    const record: PaymentRecord = { id: randomUUID(), tenantId, reference, amountPaise, currency, status: "CREATED", razorpayOrderId: order.id, createdAt: new Date().toISOString() };
    ledger.records.push(record); await saveLedger(cfg.ledgerFile, ledger);
    json(res, 201, { payment: record, keyId: cfg.keyId }); return true;
  }

  if (req.method === "POST" && pathname === "/api/payments/verify") {
    let input: any;
    try { input = JSON.parse((await body(req)).toString("utf8")); } catch { json(res, 400, { error: "invalid_json" }); return true; }
    const orderId = String(input?.razorpay_order_id ?? "");
    const paymentId = String(input?.razorpay_payment_id ?? "");
    const signature = String(input?.razorpay_signature ?? "");
    const expected = createHmac("sha256", cfg.keySecret).update(orderId + "|" + paymentId).digest("hex");
    if (!orderId || !paymentId || !validSignature(expected, signature)) { json(res, 400, { error: "payment_signature_invalid" }); return true; }
    const ledger = await readLedger(cfg.ledgerFile);
    const record = ledger.records.find(item => item.razorpayOrderId === orderId);
    if (!record) { json(res, 404, { error: "order_not_found" }); return true; }
    if (!tenantMatches(req, record.tenantId)) { json(res, 403, { error: "tenant_scope_mismatch" }); return true; }
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
      record.paidAt = new Date().toISOString(); await saveLedger(cfg.ledgerFile, ledger);
    } else if (record.razorpayPaymentId !== paymentId) { json(res, 409, { error: "order_already_paid_with_different_payment" }); return true; }
    json(res, 200, { payment: record, receiptUrl: "/api/payments/" + record.id + "/receipt.pdf" }); return true;
  }

  const receiptMatch = /^\/api\/payments\/([^/]+)\/receipt\.pdf$/.exec(pathname);
  if (req.method === "GET" && receiptMatch) {
    const ledger = await readLedger(cfg.ledgerFile);
    const record = ledger.records.find(item => item.id === decodeURIComponent(receiptMatch[1]));
    if (!record) { json(res, 404, { error: "payment_not_found" }); return true; }
    if (!tenantMatches(req, record.tenantId)) { json(res, 403, { error: "tenant_scope_mismatch" }); return true; }
    if (record.status !== "PAID") { json(res, 409, { error: "receipt_available_only_after_verified_payment" }); return true; }
    const pdf = receiptPdf(record);
    res.writeHead(200, { "content-type": "application/pdf", "content-disposition": 'attachment; filename="' + record.receiptNumber + '.pdf"', "content-length": pdf.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(pdf); return true;
  }

  json(res, 404, { error: "payment_route_not_found" }); return true;
}
