import { createHmac, timingSafeEqual } from "node:crypto";

export const CUSTOMER_SESSION_COOKIE = "__Host-eper_session";
export const CUSTOMER_CSRF_COOKIE = "__Host-eper_csrf";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateSecret(secret: string): void {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("EPER_CUSTOMER_CSRF_SECRET_REQUIRED");
  }
}

export function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) continue;
    // Ambiguous duplicate security cookies are rejected instead of taking
    // whichever value happens to appear first or last.
    if (cookies.has(name)) cookies.set(name, "");
    else cookies.set(name, value);
  }
  return cookies;
}

export function createCustomerCsrfToken(sessionToken: string, secret: string): string {
  validateSecret(secret);
  if (typeof sessionToken !== "string" || sessionToken.length < 32 || sessionToken.length > 256) {
    throw new Error("EPER_CUSTOMER_SESSION_TOKEN_INVALID");
  }
  return createHmac("sha256", secret).update("eper-customer-csrf:v1:", "utf8").update(sessionToken, "utf8").digest("base64url");
}

export function serializeCustomerSessionCookie(sessionToken: string, maxAgeSeconds: number): string {
  if (typeof sessionToken !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(sessionToken)) {
    throw new Error("EPER_CUSTOMER_SESSION_TOKEN_INVALID");
  }
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 86400) {
    throw new Error("EPER_CUSTOMER_SESSION_MAX_AGE_INVALID");
  }
  return CUSTOMER_SESSION_COOKIE + "=" + sessionToken + "; Path=/; Max-Age=" + maxAgeSeconds + "; HttpOnly; Secure; SameSite=Lax";
}

export function serializeCustomerCsrfCookie(token: string, maxAgeSeconds: number): string {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error("EPER_CUSTOMER_CSRF_TOKEN_INVALID");
  }
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 86400) {
    throw new Error("EPER_CUSTOMER_CSRF_MAX_AGE_INVALID");
  }
  return CUSTOMER_CSRF_COOKIE + "=" + token + "; Path=/; Max-Age=" + maxAgeSeconds + "; Secure; SameSite=Strict";
}

export function serializeClearedCustomerCookies(): string[] {
  return [
    CUSTOMER_SESSION_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    CUSTOMER_CSRF_COOKIE + "=; Path=/; Max-Age=0; Secure; SameSite=Strict",
  ];
}

export function isExactTrustedOrigin(origin: string | undefined, expectedOrigin: string): boolean {
  if (!origin || !expectedOrigin) return false;
  try {
    const actual = new URL(origin);
    const expected = new URL(expectedOrigin);
    const localHttp = (url: URL) => url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const actualSecure = actual.protocol === "https:" || localHttp(actual);
    const expectedSecure = expected.protocol === "https:" || localHttp(expected);
    return actualSecure && expectedSecure &&
      actual.origin === expected.origin &&
      origin === actual.origin &&
      expectedOrigin === expected.origin &&
      !actual.username && !actual.password;
  } catch {
    return false;
  }
}

/** Enforce double-submit CSRF plus a session-bound MAC for unsafe browser methods. */
export function verifyCustomerBrowserCsrf(input: {
  method: string | undefined;
  origin: string | undefined;
  expectedOrigin: string;
  cookieHeader: string | undefined;
  csrfHeader: string | undefined;
  sessionToken: string;
  secret: string;
}): boolean {
  const method = (input.method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  if (!isExactTrustedOrigin(input.origin, input.expectedOrigin)) return false;
  let expected: string;
  try { expected = createCustomerCsrfToken(input.sessionToken, input.secret); }
  catch { return false; }
  const cookies = parseCookieHeader(input.cookieHeader);
  const cookieToken = cookies.get(CUSTOMER_CSRF_COOKIE);
  return !!cookieToken && !!input.csrfHeader &&
    safeEqual(cookieToken, expected) &&
    safeEqual(input.csrfHeader, expected);
}
