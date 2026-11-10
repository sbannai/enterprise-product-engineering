export type PeripheralAction =
  | "peripheral.register"
  | "peripheral.configure"
  | "peripheral.read"
  | "peripheral.activate"
  | "peripheral.suspend";

export interface PeripheralAuthorizationInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly actorId: string;
  readonly action: PeripheralAction;
}

export interface PeripheralRolePermissionReader {
  listActiveRoleIds(tenantId: string, applicationId: string, actorId: string): Promise<string[]>;
  hasPermission(
    tenantId: string,
    applicationId: string,
    actorId: string,
    roleId: string,
    permission: string,
  ): Promise<boolean>;
}

const PERIPHERAL_ACTION_PERMISSION: Readonly<Record<PeripheralAction, string>> = Object.freeze({
  "peripheral.register": "peripheral.register",
  "peripheral.configure": "peripheral.configure",
  "peripheral.read": "peripheral.read",
  "peripheral.activate": "peripheral.activate",
  "peripheral.suspend": "peripheral.suspend",
});

/**
 * Application-scoped authorization adapter. Identity and assignment validation
 * happen at the API boundary; this class resolves current durable role grants.
 * Missing grants, empty roles, and policy-store errors always deny access.
 */
export class PostgresPeripheralRoleAuthorizer {
  constructor(private readonly assignments: PeripheralRolePermissionReader) {}

  async authorize(input: PeripheralAuthorizationInput): Promise<void> {
    if (![input.tenantId, input.applicationId, input.actorId].every(
      value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(value),
    )) {
      throw new Error("EPER_PERIPHERAL_AUTHORIZATION_SCOPE_INVALID");
    }
    let roleIds: string[];
    try {
      roleIds = await this.assignments.listActiveRoleIds(
        input.tenantId, input.applicationId, input.actorId,
      );
      if (!Array.isArray(roleIds) || roleIds.length === 0) {
        throw new Error("EPER_PERIPHERAL_ACTION_FORBIDDEN");
      }
      const grants = await Promise.all(roleIds.map(roleId =>
        this.assignments.hasPermission(
          input.tenantId, input.applicationId, input.actorId, roleId,
          PERIPHERAL_ACTION_PERMISSION[input.action],
        ),
      ));
      if (!grants.some(Boolean)) throw new Error("EPER_PERIPHERAL_ACTION_FORBIDDEN");
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_PERIPHERAL_ACTION_FORBIDDEN") throw error;
      throw new Error("EPER_PERIPHERAL_AUTHORIZATION_UNAVAILABLE", { cause: error });
    }
  }
}
