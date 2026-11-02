import type { AuditEnvironment } from "../audit/audit-event-store.js";

export type ProviderValidationEnvironment = "development" | "sandbox" | "uat" | "production";
export type ProviderValidationConnectionStatus =
  | "PENDING_VALIDATION" | "ACTIVE" | "DEGRADED" | "SUSPENDED" | "REVOKED";

export interface ProviderValidationSnapshot {
  tenantId: string;
  connectionId: string;
  providerKey: string;
  adapterKey: string;
  adapterVersion: string;
  authMode: string;
  secretReference: string;
  environment: ProviderValidationEnvironment;
  safeMetadata: Record<string, unknown>;
  status: ProviderValidationConnectionStatus;
  version: number;
}

export interface ProviderValidationResult {
  ok: boolean;
  /** Stable, non-secret diagnostic code. Never include provider response bodies. */
  errorCode?: string;
}

export interface ProviderValidationAdapter {
  validateCredentials(input: {
    authMode: string;
    credentials: unknown;
    environment: ProviderValidationEnvironment;
    safeMetadata: Readonly<Record<string, unknown>>;
  }): Promise<ProviderValidationResult>;
}

export interface ProviderValidationAdapterRegistry {
  get(adapterKey: string, adapterVersion: string): ProviderValidationAdapter | null;
}

export interface ProviderSecretResolver {
  /** Returns credential material to this server-side service only. */
  resolve(secretReference: string): Promise<unknown>;
}

export interface ProviderValidationStore {
  /** Internal-only snapshot. secretReference must never be exposed by customer-facing APIs. */
  getValidationSnapshot(tenantId: string, applicationId: string, connectionId: string): Promise<ProviderValidationSnapshot | null>;
  /** Must atomically update status, record the validation outcome, and append a redacted audit event. */
  recordValidationOutcome(input: {
    tenantId: string;
    applicationId: string;
    connectionId: string;
    expectedVersion: number;
    outcome: "SUCCEEDED" | "FAILED";
    errorCode?: string;
    actorId: string;
    correlationId: string;
    auditEnvironment: AuditEnvironment;
  }): Promise<{ status: "ACTIVE" | "DEGRADED"; version: number }>;
}

export interface ValidateProviderConnectionInput {
  tenantId: string;
  applicationId: string;
  connectionId: string;
  actorId: string;
  correlationId: string;
  auditEnvironment: AuditEnvironment;
}

export interface ValidateProviderConnectionResult {
  connectionId: string;
  outcome: "SUCCEEDED" | "FAILED";
  status: "ACTIVE" | "DEGRADED";
  version: number;
  errorCode?: string;
}

/**
 * Server-only credential validation boundary. The service never returns secret
 * material, provider payloads, exception messages, or adapter response bodies.
 * The store must enforce optimistic versioning so a rotation/revocation that
 * races validation cannot be overwritten by a stale validation result.
 */
export class ProviderConnectionValidationService {
  constructor(
    private readonly store: ProviderValidationStore,
    private readonly secrets: ProviderSecretResolver,
    private readonly adapters: ProviderValidationAdapterRegistry,
  ) {}

  async validate(input: ValidateProviderConnectionInput): Promise<ValidateProviderConnectionResult> {
    requireValue(input.tenantId, "TENANT");
    requireValue(input.applicationId, "APPLICATION_ID");
    requireValue(input.connectionId, "CONNECTION_ID");
    requireValue(input.actorId, "ACTOR");
    requireValue(input.correlationId, "CORRELATION_ID");

    const snapshot = await this.store.getValidationSnapshot(input.tenantId, input.applicationId, input.connectionId);
    if (!snapshot) throw new Error("PROVIDER_CONNECTION_NOT_FOUND");
    if (snapshot.tenantId !== input.tenantId || snapshot.connectionId !== input.connectionId) {
      throw new Error("PROVIDER_VALIDATION_SCOPE_MISMATCH");
    }
    if (snapshot.status === "REVOKED" || snapshot.status === "SUSPENDED") {
      throw new Error("PROVIDER_CONNECTION_NOT_VALIDATABLE");
    }
    if (snapshot.environment !== "development" && snapshot.environment !== "sandbox") {
      throw new Error("PROVIDER_VALIDATION_ENVIRONMENT_NOT_ALLOWED");
    }
    if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1) {
      throw new Error("PROVIDER_CONNECTION_VERSION_INVALID");
    }

    let outcome: "SUCCEEDED" | "FAILED" = "FAILED";
    let errorCode = "PROVIDER_VALIDATION_FAILED";
    try {
      const adapter = this.adapters.get(snapshot.adapterKey, snapshot.adapterVersion);
      if (!adapter) {
        errorCode = "PROVIDER_ADAPTER_UNAVAILABLE";
      } else {
        const credentials = await this.secrets.resolve(snapshot.secretReference);
        const result = await adapter.validateCredentials({
          authMode: snapshot.authMode,
          credentials,
          environment: snapshot.environment,
          safeMetadata: snapshot.safeMetadata,
        });
        if (result.ok) {
          outcome = "SUCCEEDED";
          errorCode = "";
        } else {
          errorCode = safeErrorCode(result.errorCode);
        }
      }
    } catch {
      // Never forward secret-manager or provider exception text to API/audit/logging.
      errorCode = "PROVIDER_CREDENTIAL_VALIDATION_UNAVAILABLE";
    }

    const saved = await this.store.recordValidationOutcome({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      connectionId: input.connectionId,
      expectedVersion: snapshot.version,
      outcome,
      ...(outcome === "FAILED" ? { errorCode } : {}),
      actorId: input.actorId,
      correlationId: input.correlationId,
      auditEnvironment: input.auditEnvironment,
    });
    return {
      connectionId: input.connectionId,
      outcome,
      status: saved.status,
      version: saved.version,
      ...(outcome === "FAILED" ? { errorCode } : {}),
    };
  }
}

function requireValue(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 512) {
    throw new Error("PROVIDER_VALIDATION_" + label + "_INVALID");
  }
}

function safeErrorCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z0-9_]{1,64}$/.test(value)) {
    return "PROVIDER_VALIDATION_FAILED";
  }
  return value;
}
