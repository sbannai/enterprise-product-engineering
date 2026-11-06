export interface CustomerAssetUploadRoleAssignmentReader {
  listActiveRoleIds(tenantId: string, applicationId: string, actorId: string): Promise<string[]>;
  hasPermission(
    tenantId: string,
    applicationId: string,
    actorId: string,
    roleId: string,
    permission: string,
  ): Promise<boolean>;
}

export interface CustomerAssetUploadAuthorizationInput {
  tenantId: string;
  applicationId: string;
  actorId: string;
}

/**
 * Rechecks the actor's current durable application roles and permission on every
 * upload mutation. Identity-provider claims and the browser session role label
 * are never treated as authorization.
 */
export class PostgresCustomerAssetUploadAuthorizer {
  constructor(private readonly assignments: CustomerAssetUploadRoleAssignmentReader) {
    if (!assignments || typeof assignments.listActiveRoleIds !== "function" ||
        typeof assignments.hasPermission !== "function") {
      throw new Error("CUSTOMER_ASSET_UPLOAD_ROLE_ASSIGNMENT_READER_REQUIRED");
    }
  }

  async authorize(input: CustomerAssetUploadAuthorizationInput): Promise<boolean> {
    for (const [name, value] of Object.entries(input)) {
      if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
        throw new Error("CUSTOMER_ASSET_UPLOAD_AUTHORIZATION_INVALID_" + name.toUpperCase());
      }
    }
    const roleIds = await this.assignments.listActiveRoleIds(
      input.tenantId, input.applicationId, input.actorId,
    );
    if (!Array.isArray(roleIds) || roleIds.length === 0) return false;
    const decisions = await Promise.all(roleIds.map(roleId =>
      this.assignments.hasPermission(
        input.tenantId, input.applicationId, input.actorId, roleId, "customer.asset.upload",
      ),
    ));
    return decisions.some(Boolean);
  }
}
