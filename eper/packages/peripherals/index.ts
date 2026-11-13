import { evaluateDependencyCompatibility, type DependencyPolicy, type DependencyInstallation } from "../dependencies/compatibility.js";

/**
 * Optional application-scoped peripheral capability.
 * Importing this package performs no discovery, connection or I/O.
 */
export type PeripheralKind = "barcode_scanner" | "qr_reader" | "sensor" | "rfid_nfc" | "printer" | "weighing_scale" | "custom";
export type PeripheralStatus = "DRAFT" | "REGISTERED" | "CONFIGURED" | "ACTIVE" | "DEGRADED" | "OFFLINE" | "DISCONNECTING" | "SUSPENDED" | "RETIRED";
export type PeripheralConnectionState = "NOT_CONFIGURED" | "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "DEGRADED" | "CLOSED";

export interface PeripheralScope {
  readonly tenantId: string;
  readonly applicationId: string;
}
export interface PeripheralRegistration extends PeripheralScope {
  readonly peripheralId: string;
  readonly kind: PeripheralKind;
  readonly displayName: string;
  readonly adapterKey: string | null;
  readonly adapterVersion: string | null;
  readonly status: PeripheralStatus;
  readonly configurationVersion: number;
  readonly version: number;
}
export interface PeripheralConfiguration {
  readonly adapterKey: string;
  readonly adapterVersion: string;
  /** Non-secret validated settings only. Credentials are opaque secret references. */
  readonly settings: Readonly<Record<string, unknown>>;
  readonly secretReference?: string;
}
export interface PeripheralConnectionContext extends PeripheralScope {
  readonly peripheralId: string;
  readonly correlationId: string;
  readonly configurationVersion: number;
}
export interface PeripheralAdapter {
  connect(context: PeripheralConnectionContext, configuration: PeripheralConfiguration, signal: AbortSignal): Promise<void>;
  disconnect(context: PeripheralConnectionContext): Promise<void>;
  invoke(context: PeripheralConnectionContext, command: PeripheralCommand, signal: AbortSignal): Promise<PeripheralCommandResult>;
}
export interface PeripheralCommand {
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
}
export type PeripheralCommandResult =
  | { readonly outcome: "SUCCEEDED"; readonly value?: Readonly<Record<string, unknown>> }
  | { readonly outcome: "REJECTED"; readonly code: string }
  | { readonly outcome: "NEEDS_ATTENTION"; readonly code: string };

export interface PeripheralAdapterDependency {
  readonly policy: DependencyPolicy;
  readonly installation: DependencyInstallation;
}

export interface PeripheralAdapterRegistration {
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly kinds: readonly PeripheralKind[];
  readonly adapter: PeripheralAdapter;
  /** Every vendor-managed dependency used by this adapter must be declared here. */
  readonly dependencies?: readonly PeripheralAdapterDependency[];
}

/** Exact-match registry. Resolution never opens a connection or falls back to another adapter. */
export class PeripheralAdapterRegistry {
  private readonly adapters = new Map<string, PeripheralAdapterRegistration>();
  constructor(registrations: readonly PeripheralAdapterRegistration[] = []) {
    for (const registration of registrations) this.register(registration);
  }
  register(registration: PeripheralAdapterRegistration): void {
    if (!/^[a-z][a-z0-9.-]{1,63}$/.test(registration.adapterKey) ||
        !/^\d+\.\d+\.\d+$/.test(registration.adapterVersion) ||
        registration.kinds.length === 0 ||
        new Set(registration.kinds).size !== registration.kinds.length) {
      throw new Error("PERIPHERAL_ADAPTER_REGISTRATION_INVALID");
    }
    const key = this.key(registration.adapterKey, registration.adapterVersion);
    if (this.adapters.has(key)) throw new Error("PERIPHERAL_ADAPTER_DUPLICATE");
    this.adapters.set(key, Object.freeze({ ...registration, kinds: Object.freeze([...registration.kinds]) }));
  }
  resolve(input: { adapterKey: string; adapterVersion: string; kind: PeripheralKind }): PeripheralAdapter {
    const registration = this.adapters.get(this.key(input.adapterKey, input.adapterVersion));
    if (!registration) throw new Error("PERIPHERAL_ADAPTER_NOT_REGISTERED");
    if (!registration.kinds.includes(input.kind)) throw new Error("PERIPHERAL_ADAPTER_KIND_UNSUPPORTED");
    return registration.adapter;
  }
  private key(adapterKey: string, version: string): string { return adapterKey + "@" + version; }
}

const transitions: Readonly<Record<PeripheralStatus, readonly PeripheralStatus[]>> = {
  DRAFT: ["REGISTERED", "RETIRED"],
  REGISTERED: ["CONFIGURED", "SUSPENDED", "RETIRED"],
  CONFIGURED: ["ACTIVE", "SUSPENDED", "RETIRED"],
  ACTIVE: ["DEGRADED", "OFFLINE", "DISCONNECTING", "RETIRED"],
  DEGRADED: ["ACTIVE", "OFFLINE", "DISCONNECTING", "RETIRED"],
  OFFLINE: ["ACTIVE", "DEGRADED", "DISCONNECTING", "RETIRED"],
  DISCONNECTING: ["SUSPENDED"],
  SUSPENDED: ["CONFIGURED", "RETIRED"],
  RETIRED: [],
};

/** Validates lifecycle transitions; activation is the only state that permits adapter connect. */
export function transitionPeripheral(current: PeripheralStatus, next: PeripheralStatus): PeripheralStatus {
  if (!transitions[current].includes(next)) throw new Error("PERIPHERAL_INVALID_STATE_TRANSITION");
  return next;
}

export function assertPeripheralScope(expected: PeripheralScope, actual: PeripheralScope): void {
  if (expected.tenantId !== actual.tenantId || expected.applicationId !== actual.applicationId) {
    throw new Error("PERIPHERAL_APPLICATION_SCOPE_MISMATCH");
  }
}

export function assertPeripheralConfiguredForActivation(input: {
  status: PeripheralStatus;
  adapterKey: string | null;
  adapterVersion: string | null;
  configuration: PeripheralConfiguration | null;
}): void {
  if (input.status !== "CONFIGURED" || !input.adapterKey || !input.adapterVersion || !input.configuration ||
      input.configuration.adapterKey !== input.adapterKey || input.configuration.adapterVersion !== input.adapterVersion) {
    throw new Error("PERIPHERAL_CONFIGURATION_REQUIRED_FOR_ACTIVATION");
  }
}
