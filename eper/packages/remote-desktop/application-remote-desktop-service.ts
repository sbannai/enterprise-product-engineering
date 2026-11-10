import type { ApplicationCapabilityBoundary, ApplicationCapabilityScope } from "../addon-entitlements/application-capability-boundary.js";
import type { AuditEnvironment } from "../audit/audit-event-store.js";
import type { RemoteDesktopTransport, RemoteSessionMode } from "./index.js";
import {
  PostgresRemoteDesktopSessionStore,
  type RemoteDesktopSessionRecord,
} from "./postgres-remote-desktop-session-store.js";

export interface RemoteDesktopServiceScope extends ApplicationCapabilityScope {
  readonly actorId: string;
  readonly environment: AuditEnvironment;
  readonly correlationId: string;
}
export interface RemoteDesktopEndpointConsentVerifier {
  /** Must validate a one-time, signed endpoint challenge proof and bind it to this exact session/version. */
  verify(input: {
    tenantId: string; applicationId: string; endpointId: string; sessionId: string;
    expectedVersion: number; endpointProof: string; actorId: string; grantedMode: RemoteSessionMode; correlationId: string;
  }): Promise<boolean>;
}

export interface RemoteDesktopActionAuthorizer {
  authorize(input: {
    tenantId: string; applicationId: string; actorId: string;
    action: "remote_desktop.session.request" | "remote_desktop.consent.accept" |
      "remote_desktop.control.grant" | "remote_desktop.consent.revoke" |
      "remote_desktop.session.start" | "remote_desktop.session.stop";
  }): Promise<void>;
}
export interface RequestRemoteDesktopSessionInput extends RemoteDesktopServiceScope {
  endpointId: string;
  expiresAt: string;
  sessionId?: string;
}
export interface AcceptRemoteDesktopConsentInput extends RemoteDesktopServiceScope {
  sessionId: string;
  expectedVersion: number;
  grantedMode: RemoteSessionMode;
  consentExpiresAt: string;
  /** Opaque, short-lived endpoint-signed challenge response; never log or persist it. */
  endpointProof: string;
  consentGrantId?: string;
}

/** Application service: role authorization and paid add-on entitlement precede all persistence. */
export class ApplicationRemoteDesktopService {
  constructor(
    private readonly capabilities: ApplicationCapabilityBoundary,
    private readonly store: PostgresRemoteDesktopSessionStore,
    private readonly authorizer: RemoteDesktopActionAuthorizer,
    private readonly transport?: RemoteDesktopTransport,
    private readonly endpointConsentVerifier?: RemoteDesktopEndpointConsentVerifier,
  ) {}

  async requestSession(input: RequestRemoteDesktopSessionInput): Promise<RemoteDesktopSessionRecord> {
    await this.authorize(input, "remote_desktop.session.request");
    return this.capabilities.withRemoteDesktopSharing(input, () =>
      this.store.requestSession(input));
  }

  async acceptConsent(input: AcceptRemoteDesktopConsentInput): Promise<RemoteDesktopSessionRecord> {
    await this.authorize(input, "remote_desktop.consent.accept");
    if (typeof input.endpointProof !== "string" || input.endpointProof.length < 1 || input.endpointProof.length > 8192) {
      throw new Error("REMOTE_DESKTOP_ENDPOINT_PROOF_INVALID");
    }
    if (!this.endpointConsentVerifier) {
      throw new Error("REMOTE_DESKTOP_ENDPOINT_IDENTITY_VERIFIER_NOT_CONFIGURED");
    }
    if (input.grantedMode === "REMOTE_CONTROL") {
      await this.authorize(input, "remote_desktop.control.grant");
    } else if (input.grantedMode !== "VIEW_ONLY") {
      throw new Error("REMOTE_DESKTOP_CONSENT_MODE_INVALID");
    }
    // Check paid entitlement before querying endpoint identity or invoking an external verifier.
    return this.capabilities.withRemoteDesktopSharing(input, async () => {
      const endpointId = await this.store.getEndpointId({
        ...input, sessionId: input.sessionId,
      });
      const endpointVerified = await this.endpointConsentVerifier!.verify({
        tenantId: input.tenantId, applicationId: input.applicationId, endpointId,
        sessionId: input.sessionId, expectedVersion: input.expectedVersion, endpointProof: input.endpointProof, actorId: input.actorId,
        grantedMode: input.grantedMode, correlationId: input.correlationId,
      });
      if (!endpointVerified) throw new Error("REMOTE_DESKTOP_ENDPOINT_IDENTITY_NOT_VERIFIED");
      return this.store.acceptWithConsent(input);
    });
  }

  async startSession(input: RemoteDesktopServiceScope & {
    sessionId: string; expectedVersion: number;
  }): Promise<RemoteDesktopSessionRecord> {
    await this.authorize(input, "remote_desktop.session.start");
    if (!this.transport) throw new Error("REMOTE_DESKTOP_TRANSPORT_NOT_CONFIGURED");
    return this.capabilities.withRemoteDesktopSharing(input, () =>
      this.store.startWithConsent({
        ...input,
        startTransport: async context => {
          const controller = new AbortController();
          await this.transport!.start(context, controller.signal);
          return () => this.transport!.stop(context);
        },
      }));
  }

  async stopSession(input: RemoteDesktopServiceScope & {
    sessionId: string; expectedVersion: number;
  }): Promise<RemoteDesktopSessionRecord> {
    await this.authorize(input, "remote_desktop.session.stop");
    if (!this.transport) throw new Error("REMOTE_DESKTOP_TRANSPORT_NOT_CONFIGURED");
    return this.capabilities.withRemoteDesktopSharing(input, () =>
      this.store.stopSession({
        ...input,
        stopTransport: context => this.transport!.stop(context),
      }));
  }

  async revokeConsent(input: RemoteDesktopServiceScope & {
    sessionId: string; expectedVersion: number;
  }): Promise<RemoteDesktopSessionRecord> {
    await this.authorize(input, "remote_desktop.consent.revoke");
    return this.capabilities.withRemoteDesktopSharing(input, () =>
      this.store.revokeConsent({
        ...input,
        stopTransport: this.transport
          ? context => this.transport!.stop(context)
          : undefined,
      }));
  }

  private authorize(
    input: RemoteDesktopServiceScope,
    action: Parameters<RemoteDesktopActionAuthorizer["authorize"]>[0]["action"],
  ): Promise<void> {
    return this.authorizer.authorize({
      tenantId: input.tenantId, applicationId: input.applicationId,
      actorId: input.actorId, action,
    });
  }
}
