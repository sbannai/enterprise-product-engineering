import type { PostgresWorkflowActorRoleAssignmentStore } from "../workflows/postgres-workflow-actor-role-assignment-store.js";

export interface CustomerAssetUploadPermissionStore {
  listActiveRoleIds(tenantId: string, applicationId: string, actorId: string): Promise<string[]>;
  hasPermission(tenantId: string, applicationId: string, actorId: string, roleId: string, permission: string): Promise<boolean>;
}

/**
 * Resolve upload authority only from current, durable tenant/application role
 * assignments. Browser/OIDC role labels are deliberately not accepted here.
 * Store errors propagate so callers can distinguish unavailable authorization
 * (503) from an ordinary denial (403); neither path grants access.
 */
export async function hasCustomerAssetUploadPermission(
  identity: { tenantId: string; actorId: string },
  applicationId: string,
  store: CustomerAssetUploadPermissionStore,
): Promise<boolean> {
  if (!identity.tenantId || !identity.actorId ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(applicationId)) return false;
  const roles = await store.listActiveRoleIds(identity.tenantId, applicationId, identity.actorId);
  for (const roleId of roles) {
    if (await store.hasPermission(
      identity.tenantId, applicationId, identity.actorId, roleId, "customer.asset.upload",
    )) return true;
  }
  return false;
}
