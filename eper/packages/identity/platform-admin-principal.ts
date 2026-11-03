import { timingSafeEqual } from "node:crypto";

export const PLATFORM_ADMIN_PERMISSIONS = [
  "customer_admin:provision",
  "customer_admin:recover",
  "application:remediate",
  "provider_catalogue:manage",
] as const;

export type PlatformAdminPermission = typeof PLATFORM_ADMIN_PERMISSIONS[number];

export interface TrustedPlatformAdminPrincipal {
  platformActorId: string;
  permissions: PlatformAdminPermission[];
  credentialId: string;
}

type PlatformCredentialRecord = {
  platformActorId: string;
  permissions: PlatformAdminPermission[];
  credentialId: string;
};

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}

function parseMapping(raw: string): Record<string, PlatformCredentialRecord> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const records: Record<string, PlatformCredentialRecord> = {};
  for (const [credential, candidate] of Object.entries(parsed as Record<string, unknown>)) {
    if (credential.length < 32 || credential.length > 4096 ||
        !candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    if (!isIdentifier(record.platformActorId) || !isIdentifier(record.credentialId) ||
        !Array.isArray(record.permissions) || record.permissions.length === 0 ||
        record.permissions.length > PLATFORM_ADMIN_PERMISSIONS.length ||
        !record.permissions.every((permission) =>
          typeof permission === "string" &&
          (PLATFORM_ADMIN_PERMISSIONS as readonly string[]).includes(permission)) ||
        new Set(record.permissions).size !== record.permissions.length) return null;

    records[credential] = {
      platformActorId: record.platformActorId,
      credentialId: record.credentialId,
      permissions: [...record.permissions] as PlatformAdminPermission[],
    };
  }
  return records;
}

/**
 * Resolves a platform principal only from a server-controlled credential mapping.
 * The returned principal deliberately contains no tenant, application, customer role,
 * or target actor claims. Raw credentials are never returned.
 */
export function resolvePlatformAdminPrincipal(
  authorizationHeader: string | undefined,
  mappingJson: string,
): TrustedPlatformAdminPrincipal | null {
  const match = /^Bearer ([^\\s]+)$/i.exec(authorizationHeader ?? "");
  if (!match || match[1].length < 32 || match[1].length > 4096) return null;

  const mapping = parseMapping(mappingJson);
  if (!mapping) return null;

  const supplied = Buffer.from(match[1], "utf8");
  for (const [credential, principal] of Object.entries(mapping)) {
    const expected = Buffer.from(credential, "utf8");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) continue;
    return {
      platformActorId: principal.platformActorId,
      permissions: [...principal.permissions],
      credentialId: principal.credentialId,
    };
  }
  return null;
}
