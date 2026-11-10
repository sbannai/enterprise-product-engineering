import type { ApplicationCapabilityBoundary, ApplicationCapabilityScope } from "../addon-entitlements/application-capability-boundary.js";
import type { AuditEnvironment } from "../audit/audit-event-store.js";
import type { RemoteSessionMode } from "./index.js";
import {
  PostgresRemoteDesktopSessionStore,
  type RemoteDesktopSessionRecord,
} from "./postgres-remote-desktop-session-store.js";

export interface RemoteDesktopServiceScope extends ApplicationCapabilityScope {
  readonly actorId: string;
  readonly environment: AuditEnvironment;
  readonly correlationId: string;
}
export interface RemoteDesktopActionAuthorizer {
  authorize(input: {
    tenantId: string; applicationId: string; actorId: string;
    action: "remote_desktop.session.request" | "remote_desktop.consent.accept" |
      "remote_desktop.control.grant" | "remote_desktop.consent.revoke";
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
  consentGrantId?: string;
}

/** Application service: role authorization and paid add-on entitlement precede all persistence. */
export class ApplicationRemoteDesktopService {
  constructor(
    private readonly capabilities: ApplicationCapabilityBoundary,
    private readonly store: PostgresRemoteDesktopSessionStore,
    private readonly authorizer: RemoteDesktopActionAuthorizer,
  ) {}

  async requestSession(input: RequestRemoteDesktopSessionInput): Promise<RemoteDesktopSessionRecord> {
    await this.authorize(input, "remote_desktop.session.request");
    return this.capabilities.withRemoteDesktopSharing(input, () =>
      this.store.requestSession(input));
  }

  async acceptConsent(input: AcceptRemoteDesktopConsentInput): Promise<RemoteDesktopSessionRecord> {
    await this.authorize(input, "remote_desktop.consent.accept");
    if (input.grantedMode === "REMOTE_CONTROL") {
      await this.authorize(input, "remote_desktop.control.grant");
    } else if (input.grantedMode !== "VIEW_ONLY") {
      throw new Error("REMOTE_DESKTOP_CONSENT_MODE_INVALID");
    }
    return this.capabilities.withRemoteDesktopSharing(input, () =>
      this.store.acceptWithConsent(input));
  }

  async revokeConsent(input: RemoteDesktopServiceScope & {
    sessionId: string; expectedVersion: number;
  }): Promise<RemoteDesktopSessionRecord> {
    await this.authorize(input, "remote_desktop.consent.revoke");
    return this.capabilities.withRemoteDesktopSharing(input, () =>
      this.store.revokeConsent(input));
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
