import {
  evaluateApplicationAddonAccess,
  type ApplicationAddonEntitlement,
  type AddonAccessDecision,
} from "./index.js";

export interface ApplicationAddonEntitlementReader {
  get(input: {
    tenantId: string;
    applicationId: string;
    addonKey: string;
  }): Promise<ApplicationAddonEntitlement | null>;
}
export interface ModuleCatalogueReader {
  getStatus(addonKey: string): Promise<"draft" | "active" | "deprecated" | "disabled" | null>;
}
export interface ApplicationAddonAccessRequest {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly addonKey: string;
}
export class ApplicationAddonAccessDeniedError extends Error {
  constructor(readonly decision: AddonAccessDecision) {
    super("APPLICATION_ADDON_ACCESS_DENIED:" + decision.reason);
    this.name = "ApplicationAddonAccessDeniedError";
  }
}

/**
 * Runtime gate for API/service boundaries. Both records are read from trusted
 * persistence ports; caller-supplied UI flags are deliberately not accepted.
 * Implementations must scope the entitlement query to tenant + application.
 */
export class ApplicationAddonAccessGate {
  constructor(
    private readonly entitlements: ApplicationAddonEntitlementReader,
    private readonly catalogue: ModuleCatalogueReader,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async assertAllowed(input: ApplicationAddonAccessRequest): Promise<ApplicationAddonEntitlement> {
    if (!input.tenantId?.trim() || !input.applicationId?.trim() || !input.addonKey?.trim()) {
      throw new Error("APPLICATION_ADDON_ACCESS_SCOPE_REQUIRED");
    }
    const [entitlement, catalogueStatus] = await Promise.all([
      this.entitlements.get(input),
      this.catalogue.getStatus(input.addonKey),
    ]);
    const decision = evaluateApplicationAddonAccess({
      entitlement,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      addonKey: input.addonKey,
      catalogueStatus: catalogueStatus ?? "disabled",
      now: this.clock(),
    });
    if (!decision.allowed || !entitlement) throw new ApplicationAddonAccessDeniedError(decision);
    return entitlement;
  }
}
