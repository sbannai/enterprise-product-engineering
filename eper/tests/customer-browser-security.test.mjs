import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_CSRF_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  createCustomerCsrfToken,
  isExactTrustedOrigin,
  parseCookieHeader,
  serializeClearedCustomerCookies,
  serializeCustomerCsrfCookie,
  serializeCustomerSessionCookie,
  verifyCustomerBrowserCsrf,
} from "../dist/packages/identity/customer-browser-security.js";

const secret = "test-only-csrf-secret-with-more-than-32-bytes";
const session = "s".repeat(43);
const origin = "https://customer.example.test";

test("customer session cookie is host-only, secure, HttpOnly and SameSite=Lax", () => {
  const cookie = serializeCustomerSessionCookie(session, 1800);
  assert.ok(cookie.startsWith(CUSTOMER_SESSION_COOKIE + "="));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test("CSRF cookie is readable by same-origin UI but secure and strict", () => {
  const token = createCustomerCsrfToken(session, secret);
  const cookie = serializeCustomerCsrfCookie(token, 1800);
  assert.ok(cookie.startsWith(CUSTOMER_CSRF_COOKIE + "="));
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.doesNotMatch(cookie, /HttpOnly|Domain=/i);
});

test("CSRF token is bound to the opaque browser session and secret", () => {
  const token = createCustomerCsrfToken(session, secret);
  assert.notEqual(token, createCustomerCsrfToken("t".repeat(43), secret));
  assert.notEqual(token, createCustomerCsrfToken(session, secret + "-rotated"));
});

test("cookie parser rejects ambiguous duplicate security cookies", () => {
  const parsed = parseCookieHeader(CUSTOMER_CSRF_COOKIE + "=first; theme=dark; " + CUSTOMER_CSRF_COOKIE + "=second");
  assert.equal(parsed.get(CUSTOMER_CSRF_COOKIE), "");
  assert.equal(parsed.get("theme"), "dark");
});

test("exact trusted origin rejects cross-origin and origin values with paths", () => {
  assert.equal(isExactTrustedOrigin(origin, origin), true);
  assert.equal(isExactTrustedOrigin("https://evil.example.test", origin), false);
  assert.equal(isExactTrustedOrigin(origin + "/path", origin), false);
  assert.equal(isExactTrustedOrigin(undefined, origin), false);
  assert.equal(isExactTrustedOrigin("http://customer.example.test", origin), false);
});

test("unsafe browser request requires trusted origin and session-bound double-submit token", () => {
  const token = createCustomerCsrfToken(session, secret);
  const cookieHeader = CUSTOMER_CSRF_COOKIE + "=" + token;
  const base = {
    method: "POST", origin, expectedOrigin: origin, cookieHeader,
    csrfHeader: token, sessionToken: session, secret,
  };
  assert.equal(verifyCustomerBrowserCsrf(base), true);
  assert.equal(verifyCustomerBrowserCsrf({ ...base, origin: "https://evil.example.test" }), false);
  assert.equal(verifyCustomerBrowserCsrf({ ...base, csrfHeader: "wrong" }), false);
  assert.equal(verifyCustomerBrowserCsrf({ ...base, cookieHeader: CUSTOMER_CSRF_COOKIE + "=wrong" }), false);
  assert.equal(verifyCustomerBrowserCsrf({ ...base, origin: undefined }), false);
});

test("safe methods do not require CSRF tokens", () => {
  assert.equal(verifyCustomerBrowserCsrf({
    method: "GET", origin: undefined, expectedOrigin: origin, cookieHeader: undefined,
    csrfHeader: undefined, sessionToken: session, secret,
  }), true);
});

test("logout cookie clearing expires both host-only cookies", () => {
  const cookies = serializeClearedCustomerCookies();
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) {
    assert.match(cookie, /; Max-Age=0/);
    assert.match(cookie, /; Secure/);
    assert.doesNotMatch(cookie, /Domain=/i);
  }
});
