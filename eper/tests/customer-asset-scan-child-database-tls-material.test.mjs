import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCustomerAssetScanChildDatabaseCertificateRole,
} from "../dist/packages/assets/customer-asset-scan-child-database-tls-material.js";

test("certificate role parser reads the RFC2253 subject line before extension output", () => {
  const output = [
    "subject=CN=eper_scan_child_ci",
    "X509v3 Extended Key Usage:",
    "    TLS Web Client Authentication",
    "notAfter=Nov 15 10:00:00 2026 GMT",
  ].join("\n");
  assert.equal(parseCustomerAssetScanChildDatabaseCertificateRole(output), "eper_scan_child_ci");
});

test("certificate role parser finds CN after other RFC2253 subject attributes", () => {
  assert.equal(
    parseCustomerAssetScanChildDatabaseCertificateRole("subject=OU=Scanner,O=EPER,CN=eper_scan_child_ci\n"),
    "eper_scan_child_ci",
  );
});

test("certificate role parser fails closed for missing or malformed subject output", () => {
  assert.equal(parseCustomerAssetScanChildDatabaseCertificateRole("notAfter=Nov 15 10:00:00 2026 GMT"), undefined);
  assert.equal(parseCustomerAssetScanChildDatabaseCertificateRole("subject=CN=\n"), undefined);
  assert.equal(parseCustomerAssetScanChildDatabaseCertificateRole("x".repeat(16_385)), undefined);
});


test("PostgreSQL TLS host identity rejects literal IPv4 and IPv6 addresses", async () => {
  const { assertCustomerAssetScanChildPostgresDnsHost } = await import("../dist/packages/assets/customer-asset-scan-child-database-tls-material.js");
  for (const host of ["127.0.0.1", "192.0.2.10", "::1", "2001:db8::1", "127.1", "127.0.0.1", "0x7f000001", "2130706433", "0177.0.0.1"]) {
    assert.throws(() => assertCustomerAssetScanChildPostgresDnsHost(host), /DATABASE_HOST_IDENTITY_INVALID/);
  }
});

test("PostgreSQL TLS host identity accepts DNS names without whitespace", async () => {
  const { assertCustomerAssetScanChildPostgresDnsHost } = await import("../dist/packages/assets/customer-asset-scan-child-database-tls-material.js");
  assert.equal(assertCustomerAssetScanChildPostgresDnsHost("postgres.internal.example"), "postgres.internal.example");
  assert.throws(() => assertCustomerAssetScanChildPostgresDnsHost(" postgres.internal.example"), /DATABASE_HOST_IDENTITY_INVALID/);
});
