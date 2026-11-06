import {
  CUSTOMER_OIDC_STATE_COOKIE,
  verifyCustomerOidcBrowserState,
} from "./customer-oidc-browser-flow.js";
import type { OidcLoginTransactionStore } from "./provider-neutral-oidc-client.js";
import type { PostgresCustomerIdentitySessionStore } from "./postgres-customer-identity-session-store.js";

export interface CustomerOidcCallbackClient {
  completeLogin(
    store: OidcLoginTransactionStore,
    code: string,
    state: string,
  ): Promise<{ issuer: string; subject: string }>;
}

export interface CompleteCustomerOidcBrowserLoginInput {
  client: CustomerOidcCallbackClient;
  store: Pick<PostgresCustomerIdentitySessionStore,
    "createLoginTransaction" | "consumeLoginTransaction" | "resolveSubject" | "createSession">;
  cookieHeader: string | undefined;
  code: string;
  state: string;
  correlationId: string;
  now?: () => Date;
  idleLifetimeMs?: number;
  absoluteLifetimeMs?: number;
}

/**
 * Complete the browser-bound callback in security-sensitive order:
 * verify the initiating browser cookie before consuming the one-time state,
 * then require an existing active subject binding before issuing a session.
 * createSession rechecks that binding transactionally to close the revocation race.
 */
export async function completeCustomerOidcBrowserLogin(
  input: CompleteCustomerOidcBrowserLoginInput,
): Promise<{ sessionToken: string; tenantId: string; actorId: string; issuer: string; subject: string }> {
  if (!verifyCustomerOidcBrowserState(input.cookieHeader, input.state)) {
    throw new Error("EPER_OIDC_BROWSER_STATE_MISMATCH");
  }
  if (!input.code.trim() || input.code.length > 4096) {
    throw new Error("EPER_OIDC_CALLBACK_INVALID");
  }
  const authenticated = await input.client.completeLogin(input.store, input.code, input.state);
  const binding = await input.store.resolveSubject(authenticated.issuer, authenticated.subject);
  if (!binding || binding.status !== "active") {
    throw new Error("EPER_CUSTOMER_SUBJECT_BINDING_INACTIVE");
  }
  const now = (input.now ?? (() => new Date()))();
  const idleLifetimeMs = input.idleLifetimeMs ?? 30 * 60_000;
  const absoluteLifetimeMs = input.absoluteLifetimeMs ?? 8 * 60 * 60_000;
  if (!Number.isSafeInteger(idleLifetimeMs) || idleLifetimeMs < 60_000 ||
      !Number.isSafeInteger(absoluteLifetimeMs) || absoluteLifetimeMs < idleLifetimeMs ||
      absoluteLifetimeMs > 24 * 60 * 60_000) {
    throw new Error("EPER_CUSTOMER_SESSION_LIFETIME_INVALID");
  }
  const created = await input.store.createSession({
    issuer: authenticated.issuer,
    subject: authenticated.subject,
    tenantId: binding.tenantId,
    actorId: binding.actorId,
    idleExpiresAt: new Date(now.getTime() + idleLifetimeMs),
    absoluteExpiresAt: new Date(now.getTime() + absoluteLifetimeMs),
    correlationId: input.correlationId,
  });
  return {
    sessionToken: created.sessionToken,
    tenantId: binding.tenantId,
    actorId: binding.actorId,
    issuer: authenticated.issuer,
    subject: authenticated.subject,
  };
}

export { CUSTOMER_OIDC_STATE_COOKIE };
