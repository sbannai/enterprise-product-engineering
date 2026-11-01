import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_OIDC_RETURN_COOKIE,
  CUSTOMER_OIDC_STATE_COOKIE,
  CUSTOMER_OIDC_STATE_MAX_AGE_SECONDS,
  normalizeCustomerReturnPath,
  readCustomerOidcReturnPath,
  serializeClearedCustomerOidcReturnCookie,
  serializeClearedCustomerOidcStateCookie,
  serializeCustomerOidcReturnCookie,
  serializeCustomerOidcStateCookie,
  verifyCustomerOidcBrowserState,
} from "../dist/packages/identity/customer-oidc-browser-flow.js";

const state = "s".repeat(43);
const origin = "https://customer.example.test";

test("OIDC state cookie is short-lived, host-only, HttpOnly, Secure and SameSite=Lax", () => {
  const cookie = serializeCustomerOidcStateCookie(state);
  assert.ok(cookie.startsWith(CUSTOMER_OIDC_STATE_COOKIE + "=" + state));
  assert.match(cookie, new RegExp("; Max-Age=" + CUSTOMER_OIDC_STATE_MAX_AGE_SECONDS));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test("OIDC callback requires state cookie from the initiating browser", () => {
  const cookie = CUSTOMER_OIDC_STATE_COOKIE + "=" + state;
  assert.equal(verifyCustomerOidcBrowserState(cookie, state), true);
  assert.equal(verifyCustomerOidcBrowserState(cookie, "t".repeat(43)), false);
  assert.equal(verifyCustomerOidcBrowserState(undefined, state), false);
  assert.equal(verifyCustomerOidcBrowserState(cookie + "; " + CUSTOMER_OIDC_STATE_COOKIE + "=other", state), false);
  assert.equal(verifyCustomerOidcBrowserState(cookie, "bad"), false);
});

test("OIDC state cookie is cleared after callback completion", () => {
  const cookie = serializeClearedCustomerOidcStateCookie();
  assert.ok(cookie.startsWith(CUSTOMER_OIDC_STATE_COOKIE + "="));
  assert.match(cookie, /; Max-Age=0/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test("return path accepts same-origin relative paths", () => {
  assert.equal(normalizeCustomerReturnPath("/workspace?tab=applications", origin), "/workspace?tab=applications");
  assert.equal(normalizeCustomerReturnPath("/", origin), "/");
});

test("return path rejects absolute, protocol-relative, backslash and control-character redirects", () => {
  for (const value of [
    "https://evil.example.test/",
    "//evil.example.test/",
    "/\\evil.example.test/",
    "/%2f%2fevil.example.test/",
    "/%5cevil.example.test/",
    "/%0d%0aLocation:%20https://evil.example.test",
    "/%zz",
    "workspace",
  ]) assert.equal(normalizeCustomerReturnPath(value, origin), "/");
});

test("return path requires a secure configured public origin", () => {
  assert.equal(normalizeCustomerReturnPath("/workspace", "http://customer.example.test"), "/");
  assert.equal(normalizeCustomerReturnPath("/workspace", "https://customer.example.test"), "/workspace");
  assert.equal(normalizeCustomerReturnPath("/workspace", "http://localhost:3000"), "/workspace");
});


test("OIDC return destination is short-lived, host-only and safely round-tripped", () => {
  const cookie = serializeCustomerOidcReturnCookie("/workspace?tab=applications", origin);
  assert.match(cookie, new RegExp("^" + CUSTOMER_OIDC_RETURN_COOKIE + "="));
  assert.match(cookie, /; Max-Age=300/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(readCustomerOidcReturnPath(cookie.split(";")[0], origin), "/workspace?tab=applications");
  assert.equal(readCustomerOidcReturnPath(undefined, origin), "/");
});

test("OIDC return destination rejects tampered, duplicate and cross-origin cookie values", () => {
  const safe = serializeCustomerOidcReturnCookie("/workspace", origin).split(";")[0];
  const encoded = safe.slice(safe.indexOf("=") + 1);
  const crossOrigin = Buffer.from("https://evil.example.test/", "utf8").toString("base64url");
  assert.equal(readCustomerOidcReturnPath(CUSTOMER_OIDC_RETURN_COOKIE + "=" + crossOrigin, origin), "/");
  assert.equal(readCustomerOidcReturnPath(safe + "; " + safe, origin), "/");
  assert.equal(readCustomerOidcReturnPath(CUSTOMER_OIDC_RETURN_COOKIE + "=" + encoded + "!", origin), "/");
});

test("OIDC return destination cookie is cleared after callback", () => {
  const cookie = serializeClearedCustomerOidcReturnCookie();
  assert.match(cookie, new RegExp("^" + CUSTOMER_OIDC_RETURN_COOKIE + "="));
  assert.match(cookie, /; Max-Age=0/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
});
