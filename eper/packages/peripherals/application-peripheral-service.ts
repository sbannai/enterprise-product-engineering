import type { ApplicationCapabilityBoundary, ApplicationCapabilityScope } from "../addon-entitlements/application-capability-boundary.js";
import {
  PeripheralAdapterRegistry,
  type PeripheralConnectionContext,
  type PeripheralKind,
  type PeripheralRegistration,
} from "./index.js";
import {
  PostgresPeripheralRepository,
  type PeripheralAuditContext,
  type RegisterPeripheralInput,
  type ConfigurePeripheralInput,
} from "./postgres-peripheral-repository.js";

export interface PeripheralServiceScope extends ApplicationCapabilityScope, PeripheralAuditContext {}

export interface RegisterApplicationPeripheralInput extends PeripheralServiceScope {
  peripheralId?: string;
  kind: PeripheralKind;
  displayName: string;
}

export interface ConfigureApplicationPeripheralInput extends PeripheralServiceScope {
  peripheralId: string;
  expectedVersion: number;
  configuration: {
    adapterKey: string;
    adapterVersion: string;
    settings: Readonly<Record<string, unknown>>;
    secretReference?: string;
  };
}

export interface PeripheralActivationInput extends PeripheralServiceScope {
  peripheralId: string;
  expectedVersion: number;
}

/**
 * Application-facing orchestration boundary. Persistence and entitlement are
 * checked before adapter resolution; resolving an adapter never connects it.
 * Only activate() can call connect(), after the database transition succeeds.
 */
export class ApplicationPeripheralService {
  constructor(
    private readonly capabilities: ApplicationCapabilityBoundary,
    private readonly repository: PostgresPeripheralRepository,
    private readonly adapters: PeripheralAdapterRegistry,
  ) {}

  async register(input: RegisterApplicationPeripheralInput): Promise<PeripheralRegistration> {
    return this.capabilities.withPeripheralManagement(input, () =>
      this.repository.register({ ...this.auditInput(input), peripheralId: input.peripheralId, kind: input.kind, displayName: input.displayName }));
  }

  async configure(input: ConfigureApplicationPeripheralInput): Promise<PeripheralRegistration> {
    return this.capabilities.withPeripheralManagement(input, () =>
      this.repository.configure(this.configureInput(input)));
  }

  async activate(input: PeripheralActivationInput): Promise<PeripheralRegistration> {
    return this.capabilities.withPeripheralManagement(input, async () => {
      const current = await this.repository.get(input, input.peripheralId);
      if (!current) throw new Error("EPER_PERIPHERAL_NOT_FOUND");
      if (current.status !== "CONFIGURED") throw new Error("EPER_PERIPHERAL_CONFIGURATION_REQUIRED");
      const configuration = await this.repository.getConfiguration(input, input.peripheralId);
      if (!configuration) throw new Error("EPER_PERIPHERAL_CONFIGURATION_REQUIRED");
      const adapter = this.adapters.resolve({
        adapterKey: configuration.adapterKey,
        adapterVersion: configuration.adapterVersion,
        kind: current.kind,
      });
      const active = await this.repository.transition({
        ...this.auditInput(input),
        peripheralId: input.peripheralId,
        expectedVersion: input.expectedVersion,
        nextStatus: "ACTIVE",
      });
      const context: PeripheralConnectionContext = {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        peripheralId: input.peripheralId,
        correlationId: input.correlationId,
        configurationVersion: active.configurationVersion,
      };
      try {
        await adapter.connect(context, configuration, new AbortController().signal);
        return active;
      } catch (error) {
        // A failed physical connection is represented durably; it is never
        // silently reported as active. The next version is the activation result.
        try {
          await this.repository.transition({
            ...this.auditInput(input),
            peripheralId: input.peripheralId,
            expectedVersion: active.version,
            nextStatus: "DEGRADED",
          });
        } catch (stateError) {
          // Preserve both failures: the physical connection failed and the
          // compensating durable state update failed. Never hide stale ACTIVE.
          throw new AggregateError(
            [error, stateError],
            "EPER_PERIPHERAL_ADAPTER_CONNECT_AND_DEGRADED_STATE_PERSIST_FAILED",
          );
        }
        throw new Error("EPER_PERIPHERAL_ADAPTER_CONNECT_FAILED", { cause: error });
      }
    });
  }

  async suspend(input: PeripheralActivationInput): Promise<PeripheralRegistration> {
    return this.capabilities.withPeripheralManagement(input, async () => {
      const current = await this.repository.get(input, input.peripheralId);
      if (!current) throw new Error("EPER_PERIPHERAL_NOT_FOUND");
      const needsDisconnect = current.status === "ACTIVE" ||
        current.status === "DEGRADED" || current.status === "OFFLINE" ||
        current.status === "DISCONNECTING";
      if (!needsDisconnect) {
        return this.repository.transition({
          ...this.auditInput(input),
          peripheralId: input.peripheralId,
          expectedVersion: input.expectedVersion,
          nextStatus: "SUSPENDED",
        });
      }

      if (current.status === "DISCONNECTING" && current.version !== input.expectedVersion) {
        throw new Error("EPER_PERIPHERAL_VERSION_CONFLICT");
      }
      const configuration = await this.repository.getConfiguration(input, input.peripheralId);
      if (!configuration) throw new Error("EPER_PERIPHERAL_CONFIGURATION_REQUIRED");
      const adapter = this.adapters.resolve({
        adapterKey: configuration.adapterKey,
        adapterVersion: configuration.adapterVersion,
        kind: current.kind,
      });
      // A failed earlier disconnect leaves DISCONNECTING durable. Retry the
      // adapter shutdown directly instead of attempting an illegal self-transition.
      // First-time shutdown persists DISCONNECTING before physical I/O.
      const disconnecting = current.status === "DISCONNECTING"
        ? current
        : await this.repository.transition({
            ...this.auditInput(input),
            peripheralId: input.peripheralId,
            expectedVersion: input.expectedVersion,
            nextStatus: "DISCONNECTING",
          });
      try {
        await adapter.disconnect({
          tenantId: input.tenantId,
          applicationId: input.applicationId,
          peripheralId: input.peripheralId,
          correlationId: input.correlationId,
          configurationVersion: current.configurationVersion,
        });
      } catch (error) {
        throw new Error("EPER_PERIPHERAL_ADAPTER_DISCONNECT_FAILED_RECONCILIATION_REQUIRED", { cause: error });
      }
      return this.repository.transition({
        ...this.auditInput(input),
        peripheralId: input.peripheralId,
        expectedVersion: disconnecting.version,
        nextStatus: "SUSPENDED",
      });
    });
  }

  private auditInput(input: PeripheralServiceScope) {
    return {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      actorId: input.actorId,
      environment: input.environment,
      correlationId: input.correlationId,
    };
  }

  private configureInput(input: ConfigureApplicationPeripheralInput): ConfigurePeripheralInput {
    return {
      ...this.auditInput(input),
      peripheralId: input.peripheralId,
      expectedVersion: input.expectedVersion,
      configuration: input.configuration,
    };
  }
}
