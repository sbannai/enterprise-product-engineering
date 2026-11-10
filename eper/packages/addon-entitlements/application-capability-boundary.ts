import { ApplicationAddonAccessGate } from "./application-addon-access-gate.js";
import type { ApplicationAddonEntitlement } from "./index.js";

export const APPLICATION_CAPABILITY_ADDONS = Object.freeze({
  peripherals: "peripheral_management",
  remoteDesktop: "remote_desktop_sharing",
} as const);

export interface ApplicationCapabilityScope {
  readonly tenantId: string;
  readonly applicationId: string;
}

/**
 * The only supported service-boundary entry point for optional application
 * capabilities. Entitlement is resolved from trusted persistence before the
 * operation callback runs; request flags and UI visibility are never inputs.
 */
export class ApplicationCapabilityBoundary {
  constructor(private readonly access: ApplicationAddonAccessGate) {}

  async withPeripheralManagement<T>(
    scope: ApplicationCapabilityScope,
    operation: (entitlement: ApplicationAddonEntitlement) => Promise<T>,
  ): Promise<T> {
    const entitlement = await this.access.assertAllowed({
      ...scope,
      addonKey: APPLICATION_CAPABILITY_ADDONS.peripherals,
    });
    return operation(entitlement);
  }

  async withRemoteDesktopSharing<T>(
    scope: ApplicationCapabilityScope,
    operation: (entitlement: ApplicationAddonEntitlement) => Promise<T>,
  ): Promise<T> {
    const entitlement = await this.access.assertAllowed({
      ...scope,
      addonKey: APPLICATION_CAPABILITY_ADDONS.remoteDesktop,
    });
    return operation(entitlement);
  }
}
