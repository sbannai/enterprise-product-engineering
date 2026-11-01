import { timingSafeEqual } from "node:crypto";
import { parseCookieHeader } from "./customer-browser-security.js";

export const CUSTOMER_OIDC_STATE_COOKIE = "__Host-eper_oidc_state";
export const CUSTOMER_OIDC_STATE_MAX_AGE_SECONDS = 300;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Bind an OIDC authorization transaction to the browser that initiated it. */
export function serializeCustomerOidcStateCookie(state: string): string {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new Error("EPER_OIDC_STATE_INVALID");
  }
  return CUSTOMER_OIDC_STATE_COOKIE + "=" + state +
    "; Path=/; Max-Age=" + CUSTOMER_OIDC_STATE_MAX_AGE_SECONDS +
    "; HttpOnly; Secure; SameSite=Lax";
}

/** Callback must present the exact state cookie issued by this browser at login start. */
export function verifyCustomerOidcBrowserState(cookieHeader: string | undefined, callbackState: string | undefined): boolean {
  if (typeof callbackState !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(callbackState)) return false;
  const cookies = parseCookieHeader(cookieHeader);
  const cookieState = cookies.get(CUSTOMER_OIDC_STATE_COOKIE);
  return typeof cookieState === "string" && safeEqual(cookieState, callbackState);
}

export function serializeClearedCustomerOidcStateCookie(): string {
  return CUSTOMER_OIDC_STATE_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

/**
 * Permit only a same-origin absolute-path return destination. Reject ambiguous
 * encodings and path forms that browsers/proxies may normalize differently.
 */
export function normalizeCustomerReturnPath(candidate: string | undefined, publicOrigin: string): string {
  const fallback = "/";
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 2048 ||
      !candidate.startsWith("/") || candidate.startsWith("//") ||
      candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  let decoded: string;
  try { decoded = decodeURIComponent(candidate); } catch { return fallback; }
  if (decoded.startsWith("//") || decoded.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(decoded)) return fallback;
  try {
    const base = new URL(publicOrigin);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) return fallback;
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base.origin || resolved.username || resolved.password) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
