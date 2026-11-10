import type { ApplicationCapabilityScope } from "./application-capability-boundary.js";
import { ApplicationCapabilityBoundary } from "./application-capability-boundary.js";

function assertTrustedApplicationScope(scope: ApplicationCapabilityScope): void {
  if (!scope || typeof scope.tenantId !== "string" || !scope.tenantId.trim() ||
      typeof scope.applicationId !== "string" || !scope.applicationId.trim()) {
    throw new Error("APPLICATION_CAPABILITY_TRUSTED_SCOPE_REQUIRED");
  }
}

/**
 * Runtime application-service façade for paid optional capabilities.
 *
 * The scope must be built by the authenticated request/worker context, never
 * copied from a request body. Implementations receive it separately from the
 * operation payload so tenant/application ownership remains explicit.
 */
export interface PeripheralCapabilityOperations {
  register(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  configure(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  activate(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  assign(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  invoke(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  /** Must validate authenticated actor + resource ownership; it must not check paid entitlement. */
  authorizeCleanup(scope: ApplicationCapabilityScope, input: unknown): Promise<void>;
  /** Safety cleanup remains available after expiry/suspension/revocation. */
  deactivate(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  disconnect(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
}

export class EntitledPeripheralCapabilityService {
  constructor(
    private readonly boundary: ApplicationCapabilityBoundary,
    private readonly operations: PeripheralCapabilityOperations,
  ) {}

  register(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    return this.boundary.withPeripheralManagement(scope, () => this.operations.register(scope, input));
  }
  configure(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    return this.boundary.withPeripheralManagement(scope, () => this.operations.configure(scope, input));
  }
  activate(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    return this.boundary.withPeripheralManagement(scope, () => this.operations.activate(scope, input));
  }
  assign(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    return this.boundary.withPeripheralManagement(scope, () => this.operations.assign(scope, input));
  }
  invoke(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    return this.boundary.withPeripheralManagement(scope, () => this.operations.invoke(scope, input));
  }
  async deactivate(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    await this.operations.authorizeCleanup(scope, input);
    return this.operations.deactivate(scope, input);
  }
  async disconnect(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    await this.operations.authorizeCleanup(scope, input);
    return this.operations.disconnect(scope, input);
  }
}

export interface RemoteDesktopCapabilityOperations {
  request(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  accept(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  start(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  /** Must validate authenticated actor + session ownership; no paid entitlement check. */
  authorizeCleanup(scope: ApplicationCapabilityScope, input: unknown): Promise<void>;
  /** Stop/revoke must remain possible even if the paid entitlement expires. */
  stop(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
  revoke(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown>;
}

export class EntitledRemoteDesktopCapabilityService {
  constructor(
    private readonly boundary: ApplicationCapabilityBoundary,
    private readonly operations: RemoteDesktopCapabilityOperations,
  ) {}

  request(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    return this.boundary.withRemoteDesktopSharing(scope, () => this.operations.request(scope, input));
  }
  accept(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    return this.boundary.withRemoteDesktopSharing(scope, () => this.operations.accept(scope, input));
  }
  start(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    return this.boundary.withRemoteDesktopSharing(scope, () => this.operations.start(scope, input));
  }
  async stop(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    await this.operations.authorizeCleanup(scope, input);
    return this.operations.stop(scope, input);
  }
  async revoke(scope: ApplicationCapabilityScope, input: unknown): Promise<unknown> {
    assertTrustedApplicationScope(scope);
    await this.operations.authorizeCleanup(scope, input);
    return this.operations.revoke(scope, input);
  }
}
