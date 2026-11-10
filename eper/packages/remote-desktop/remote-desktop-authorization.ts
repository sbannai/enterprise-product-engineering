export type RemoteDesktopAction =
  | "remote_desktop.session.request"
  | "remote_desktop.consent.accept"
  | "remote_desktop.control.grant"
  | "remote_desktop.consent.revoke";

export interface RemoteDesktopRolePermissionReader {
  listActiveRoleIds(tenantId: string, applicationId: string, actorId: string): Promise<string[]>;
  hasPermission(tenantId: string, applicationId: string, actorId: string, roleId: string, permission: string): Promise<boolean>;
}
const permissionByAction: Readonly<Record<RemoteDesktopAction, string>> = Object.freeze({
  "remote_desktop.session.request": "remote_desktop.session.request",
  "remote_desktop.consent.accept": "remote_desktop.consent.accept",
  "remote_desktop.control.grant": "remote_desktop.control.grant",
  "remote_desktop.consent.revoke": "remote_desktop.consent.revoke",
});

/** Fail-closed, application-scoped authorization for remote desktop actions. */
export class PostgresRemoteDesktopRoleAuthorizer {
  constructor(private readonly assignments: RemoteDesktopRolePermissionReader) {}
  async authorize(input: {
    tenantId: string; applicationId: string; actorId: string; action: RemoteDesktopAction;
  }): Promise<void> {
    if (![input.tenantId, input.applicationId, input.actorId].every(value =>
      typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(value))) {
      throw new Error("REMOTE_DESKTOP_AUTHORIZATION_SCOPE_INVALID");
    }
    try {
      const roleIds = await this.assignments.listActiveRoleIds(input.tenantId, input.applicationId, input.actorId);
      if (!Array.isArray(roleIds) || roleIds.length === 0) throw new Error("REMOTE_DESKTOP_ACTION_FORBIDDEN");
      const grants = await Promise.all(roleIds.map(roleId =>
        this.assignments.hasPermission(input.tenantId, input.applicationId, input.actorId, roleId,
          permissionByAction[input.action])));
      if (!grants.some(Boolean)) throw new Error("REMOTE_DESKTOP_ACTION_FORBIDDEN");
    } catch (error) {
      if (error instanceof Error && error.message === "REMOTE_DESKTOP_ACTION_FORBIDDEN") throw error;
      throw new Error("REMOTE_DESKTOP_AUTHORIZATION_UNAVAILABLE", { cause: error });
    }
  }
}
