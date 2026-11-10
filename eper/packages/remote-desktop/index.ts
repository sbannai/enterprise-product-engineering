/**
 * Optional application-scoped remote assistance capability.
 * Importing this package performs no endpoint discovery, capture, signalling or network I/O.
 * Screen viewing requires explicit endpoint consent. Remote control is a separate grant.
 */
export type RemoteSessionStatus =
  | "REQUESTED" | "ACCEPTED" | "ACTIVE" | "STOPPED" | "DENIED" | "EXPIRED" | "REVOKED" | "DISCONNECTED";
export type RemoteSessionMode = "VIEW_ONLY" | "REMOTE_CONTROL";

export interface RemoteDesktopScope {
  readonly tenantId: string;
  readonly applicationId: string;
}
export interface RemoteDesktopSession extends RemoteDesktopScope {
  readonly sessionId: string;
  readonly requesterId: string;
  readonly endpointId: string;
  readonly status: RemoteSessionStatus;
  readonly mode: RemoteSessionMode;
  readonly consentGrantId: string | null;
  readonly expiresAt: string;
  readonly version: number;
}
export interface RemoteDesktopConsent extends RemoteDesktopScope {
  readonly consentGrantId: string;
  readonly sessionId: string;
  readonly endpointId: string;
  readonly subjectId: string;
  readonly grantedMode: RemoteSessionMode;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}
export interface RemoteDesktopTransportContext extends RemoteDesktopScope {
  readonly sessionId: string;
  readonly endpointId: string;
  readonly correlationId: string;
  readonly consentGrantId: string;
  readonly mode: RemoteSessionMode;
}
export interface RemoteDesktopTransport {
  start(context: RemoteDesktopTransportContext, signal: AbortSignal): Promise<void>;
  stop(context: RemoteDesktopTransportContext): Promise<void>;
}
export interface RemoteDesktopAuditPort {
  record(input: {
    tenantId: string; applicationId: string; sessionId: string;
    actorId: string; action: string; outcome: string; correlationId: string;
  }): Promise<void>;
}

const transitions: Readonly<Record<RemoteSessionStatus, readonly RemoteSessionStatus[]>> = {
  REQUESTED: ["ACCEPTED", "DENIED", "EXPIRED", "REVOKED"],
  ACCEPTED: ["ACTIVE", "EXPIRED", "REVOKED", "DISCONNECTED"],
  ACTIVE: ["STOPPED", "EXPIRED", "REVOKED", "DISCONNECTED"],
  STOPPED: [], DENIED: [], EXPIRED: [], REVOKED: [], DISCONNECTED: [],
};

/** Enforces the explicit session lifecycle; terminal sessions cannot be restarted. */
export function transitionRemoteSession(current: RemoteSessionStatus, next: RemoteSessionStatus): RemoteSessionStatus {
  if (!transitions[current].includes(next)) throw new Error("REMOTE_DESKTOP_INVALID_SESSION_TRANSITION");
  return next;
}

export function assertRemoteDesktopScope(expected: RemoteDesktopScope, actual: RemoteDesktopScope): void {
  if (expected.tenantId !== actual.tenantId || expected.applicationId !== actual.applicationId) {
    throw new Error("REMOTE_DESKTOP_APPLICATION_SCOPE_MISMATCH");
  }
}

/** A session can start only with unexpired, matching, unrevoked endpoint consent. */
export function assertRemoteDesktopConsent(input: {
  session: RemoteDesktopSession;
  consent: RemoteDesktopConsent | null;
  now?: Date;
}): void {
  const consent = input.consent;
  const now = input.now ?? new Date();
  if (!consent ||
      consent.sessionId !== input.session.sessionId ||
      consent.tenantId !== input.session.tenantId ||
      consent.applicationId !== input.session.applicationId ||
      consent.endpointId !== input.session.endpointId ||
      consent.revokedAt !== null ||
      Date.parse(consent.expiresAt) <= now.getTime() ||
      Date.parse(input.session.expiresAt) <= now.getTime() ||
      input.session.status !== "ACCEPTED" ||
      (input.session.mode === "REMOTE_CONTROL" && consent.grantedMode !== "REMOTE_CONTROL")) {
    throw new Error("REMOTE_DESKTOP_EXPLICIT_CONSENT_REQUIRED");
  }
}

/** Consent escalation is never implicit: view-only cannot become remote control. */
export function assertRemoteDesktopModeGrant(
  requestedMode: RemoteSessionMode,
  consent: RemoteDesktopConsent,
): void {
  if (requestedMode === "REMOTE_CONTROL" && consent.grantedMode !== "REMOTE_CONTROL") {
    throw new Error("REMOTE_DESKTOP_CONTROL_CONSENT_REQUIRED");
  }
}
