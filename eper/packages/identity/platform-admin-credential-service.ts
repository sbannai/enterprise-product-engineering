import { randomUUID } from "node:crypto";
import type { AuditEnvironment } from "../audit/audit-event-store.js";
import type { TrustedPlatformAdminPrincipal } from "./platform-admin-principal.js";
import { PostgresPlatformAdminCredentialStore, type IssuedPlatformAdminCredential, type PlatformAdminCredentialPermission } from "./postgres-platform-admin-credential-store.js";

export const PLATFORM_ADMIN_CREDENTIAL_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export interface PlatformCredentialManagementContext {
  correlationId: string;
  environment: AuditEnvironment;
  serviceVersion?: string;
}
export interface IssuePlatformCredentialInput {
  platformActorId: string;
  permissions: PlatformAdminCredentialPermission[];
  expiresAt: string;
}

/**
 * Authorization boundary above the persistence store.
 * The authenticated principal is the sole source of issuer identity and grant ceiling.
 */
export class PlatformAdminCredentialService {
  constructor(private readonly store: PostgresPlatformAdminCredentialStore) {}

  private assertCredentialManager(issuer: TrustedPlatformAdminPrincipal): void {
    if (!issuer || !issuer.platformActorId ||
        !issuer.permissions.includes("platform_admin:credentials:manage")) {
      throw new Error("PLATFORM_ADMIN_CREDENTIAL_MANAGEMENT_FORBIDDEN");
    }
  }

  async issue(
    issuer: TrustedPlatformAdminPrincipal,
    input: IssuePlatformCredentialInput,
    context: PlatformCredentialManagementContext,
  ): Promise<IssuedPlatformAdminCredential> {
    this.assertCredentialManager(issuer);
    if (!input || !Array.isArray(input.permissions) || input.permissions.length === 0 ||
        new Set(input.permissions).size !== input.permissions.length ||
        input.permissions.some((permission) => !issuer.permissions.includes(permission))) {
      throw new Error("PLATFORM_ADMIN_CREDENTIAL_GRANT_EXCEEDS_ISSUER_AUTHORITY");
    }
    const expiry = Date.parse(input.expiresAt);
    const now = Date.now();
    if (!Number.isFinite(expiry) || expiry <= now ||
        expiry > now + PLATFORM_ADMIN_CREDENTIAL_MAX_LIFETIME_MS) {
      throw new Error("PLATFORM_ADMIN_CREDENTIAL_EXPIRY_INVALID");
    }
    return this.store.issue({
      ...context,
      actorId: issuer.platformActorId,
      credentialId: randomUUID(),
      platformActorId: input.platformActorId,
      permissions: [...input.permissions],
      expiresAt: new Date(expiry).toISOString(),
    });
  }

  async revoke(
    issuer: TrustedPlatformAdminPrincipal,
    credentialId: string,
    context: PlatformCredentialManagementContext,
  ): Promise<boolean> {
    this.assertCredentialManager(issuer);
    return this.store.revoke({
      ...context,
      actorId: issuer.platformActorId,
      credentialId,
    });
  }
}
