import type { ApplicationCapabilityBoundary, ApplicationCapabilityScope } from "../addon-entitlements/application-capability-boundary.js";
import { assertDependencyRuntimeCompatible } from "../dependencies/runtime-gate.js";
import type { PostgresDependencyInventoryRepository } from "../dependencies/postgres-dependency-inventory-repository.js";
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

export interface PeripheralServiceScope extends ApplicationCapabilityScope, PeripheralAuditContext {
  /** Trusted execution context IDs used to resolve shared dependency installations. */
  workstationId?: string;
  gatewayId?: string;
}

export interface PeripheralActionAuthorizer {
  authorize(input: {
    tenantId: string;
    applicationId: string;
    actorId: string;
    /** Must be validated against the authenticated actor and tenant/application before authorization succeeds. */
    workstationId?: string;
    gatewayId?: string;
    action: "peripheral.register" | "peripheral.configure" | "peripheral.read" | "peripheral.activate" | "peripheral.suspend";
  }): Promise<void>;
}

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
    private readonly authorizer: PeripheralActionAuthorizer,
    private readonly dependencyInventory?: PostgresDependencyInventoryRepository,
  ) {}

  async list(input: PeripheralServiceScope): Promise<PeripheralRegistration[]> {
    await this.authorizer.authorize({ ...this.actorScope(input), action: "peripheral.read" });
    return this.capabilities.withPeripheralManagement(input, () =>
      this.repository.list(input));
  }

  async get(input: PeripheralServiceScope & { peripheralId: string }): Promise<PeripheralRegistration | null> {
    await this.authorizer.authorize({ ...this.actorScope(input), action: "peripheral.read" });
    return this.capabilities.withPeripheralManagement(input, () =>
      this.repository.get(input, input.peripheralId));
  }

  async register(input: RegisterApplicationPeripheralInput): Promise<PeripheralRegistration> {
    await this.authorizer.authorize({ ...this.actorScope(input), action: "peripheral.register" });
    return this.capabilities.withPeripheralManagement(input, () =>
      this.repository.register({ ...this.auditInput(input), peripheralId: input.peripheralId, kind: input.kind, displayName: input.displayName }));
  }

  async configure(input: ConfigureApplicationPeripheralInput): Promise<PeripheralRegistration> {
    await this.authorizer.authorize({ ...this.actorScope(input), action: "peripheral.configure" });
    return this.capabilities.withPeripheralManagement(input, () =>
      this.repository.configure(this.configureInput(input)));
  }

  async activate(input: PeripheralActivationInput): Promise<PeripheralRegistration> {
    await this.authorizer.authorize({ ...this.actorScope(input), action: "peripheral.activate" });
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
      // Vendor-mandated dependency policy is evaluated before any durable ACTIVE
      // transition or physical adapter I/O. A blocked dependency stays inactive.
      await this.assertPersistedDependenciesCompatible({
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        peripheralId: input.peripheralId,
        adapterKey: configuration.adapterKey,
        adapterVersion: configuration.adapterVersion,
        kind: current.kind,
        evaluatedAt: new Date().toISOString(),
        workstationId: input.workstationId,
        userId: input.actorId,
        gatewayId: input.gatewayId,
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
    await this.authorizer.authorize({ ...this.actorScope(input), action: "peripheral.suspend" });
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

  private async assertPersistedDependenciesCompatible(input: {
    tenantId:string; applicationId:string; peripheralId:string; adapterKey:string;
    adapterVersion:string; kind:PeripheralKind; evaluatedAt:string;
    workstationId?:string; userId?:string; gatewayId?:string;
  }):Promise<void>{
    const ids = this.adapters.dependencyIds?.({
      adapterKey:input.adapterKey,adapterVersion:input.adapterVersion,kind:input.kind,
    });
    // Explicit [] is the only dependency-free declaration. Adapter snapshots
    // never authorize runtime use; the shared gate reads persisted inventory.
    if(!Array.isArray(ids))throw new Error("EPER_PERIPHERAL_DEPENDENCY_DECLARATION_REQUIRED");
    if(ids.length===0)return;
    if(!this.dependencyInventory)throw new Error("EPER_DEPENDENCY_INVENTORY_NOT_CONFIGURED");
    await assertDependencyRuntimeCompatible({
      repository:this.dependencyInventory,
      scope:{tenantId:input.tenantId,applicationId:input.applicationId,
        deviceId:input.peripheralId,workstationId:input.workstationId,
        userId:input.userId,gatewayId:input.gatewayId},
      dependencyIds:ids,evaluatedAt:input.evaluatedAt,errorPrefix:"EPER_PERIPHERAL_DEPENDENCY",
    });
  }

  private actorScope(input: PeripheralServiceScope) {
    return {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      actorId: input.actorId,
      workstationId: input.workstationId,
      gatewayId: input.gatewayId,
    };
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
