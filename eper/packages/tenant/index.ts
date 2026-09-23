export interface TenantContext { tenantId: string; organizationId?: string; privilegedCrossTenant: boolean; }
export function requireTenantContext(ctx: TenantContext): TenantContext { if (!ctx?.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED"); return ctx; }
