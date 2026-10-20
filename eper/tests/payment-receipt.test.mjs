import test from "node:test";
import assert from "node:assert/strict";
import { PaymentReceiptService } from "../dist/packages/payments/payment-receipt.js";

function start(service = new PaymentReceiptService()) {
  return service.initiate({
    tenantId: "tenant-a", principalId: "payer-1", amountPaise: 12550,
    description: "EPER UAT test fee", idempotencyKey: "payment-case-001",
  });
}

test("payment initiation creates a pending sandbox payment in INR", () => {
  const result = start();
  assert.equal(result.provider, "EPER_SANDBOX");
  assert.equal(result.payment.status, "PENDING");
  assert.equal(result.payment.amountPaise, 12550);
  assert.equal(result.payment.currency, "INR");
  assert.equal(result.replayed, false);
});

test("payment initiation is idempotent and rejects conflicting key reuse", () => {
  const service = new PaymentReceiptService();
  const first = start(service);
  const replay = start(service);
  assert.equal(replay.replayed, true);
  assert.equal(replay.payment.id, first.payment.id);
  assert.throws(() => service.initiate({
    tenantId: "tenant-a", principalId: "payer-1", amountPaise: 999,
    description: "different amount", idempotencyKey: "payment-case-001",
  }), /PAYMENT_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST/);
});

test("receipt is unavailable before confirmed payment", () => {
  const service = new PaymentReceiptService();
  const { payment } = start(service);
  assert.throws(() => service.getReceipt("tenant-a", payment.id), /RECEIPT_NOT_AVAILABLE/);
});

test("confirmed success enables PDF receipt; duplicate callback is safe", () => {
  const service = new PaymentReceiptService();
  const { payment } = start(service);
  service.applyGatewayResult({ tenantId: "tenant-a", paymentId: payment.id, outcome: "SUCCEEDED", providerReference: "sandbox-txn-001" });
  const replay = service.applyGatewayResult({ tenantId: "tenant-a", paymentId: payment.id, outcome: "SUCCEEDED", providerReference: "sandbox-txn-001" });
  assert.equal(replay.status, "SUCCEEDED");
  const receipt = service.getReceipt("tenant-a", payment.id);
  assert.equal(receipt.contentType, "application/pdf");
  assert.match(receipt.bytes.toString("ascii", 0, 8), /%PDF-1\.4/);
  assert.ok(receipt.bytes.toString("ascii").includes("125.50 INR"));
});

test("payment and receipt are isolated by tenant", () => {
  const service = new PaymentReceiptService();
  const { payment } = start(service);
  assert.equal(service.get("tenant-b", payment.id), undefined);
  assert.throws(() => service.applyGatewayResult({ tenantId: "tenant-b", paymentId: payment.id, outcome: "SUCCEEDED", providerReference: "spoofed" }), /PAYMENT_NOT_FOUND/);
  service.applyGatewayResult({ tenantId: "tenant-a", paymentId: payment.id, outcome: "SUCCEEDED", providerReference: "sandbox-txn-001" });
  assert.throws(() => service.getReceipt("tenant-b", payment.id), /PAYMENT_NOT_FOUND/);
});

test("failed payment never yields receipt and terminal state cannot change", () => {
  const service = new PaymentReceiptService();
  const { payment } = start(service);
  service.applyGatewayResult({ tenantId: "tenant-a", paymentId: payment.id, outcome: "FAILED", providerReference: "sandbox-fail-001" });
  assert.throws(() => service.getReceipt("tenant-a", payment.id), /RECEIPT_NOT_AVAILABLE/);
  assert.throws(() => service.applyGatewayResult({ tenantId: "tenant-a", paymentId: payment.id, outcome: "SUCCEEDED", providerReference: "sandbox-success-002" }), /PAYMENT_TERMINAL_STATE_CONFLICT/);
});

test("invalid amount and unsupported currency are rejected", () => {
  const service = new PaymentReceiptService();
  assert.throws(() => service.initiate({ tenantId: "tenant-a", principalId: "payer-1", amountPaise: 0, description: "invalid", idempotencyKey: "bad-amount" }), /PAYMENT_AMOUNT_INVALID/);
  assert.throws(() => service.initiate({ tenantId: "tenant-a", principalId: "payer-1", amountPaise: 100, currency: "USD", description: "invalid", idempotencyKey: "bad-currency" }), /PAYMENT_CURRENCY_UNSUPPORTED/);
});
