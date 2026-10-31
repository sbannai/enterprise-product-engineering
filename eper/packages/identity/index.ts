export interface PrincipalContext { principalId: string; authenticated: boolean; correlationId: string; claims: Record<string, unknown>; }
export interface IdentityProvider { authenticate(token: string): Promise<PrincipalContext>; }

export {
  ActorApplicationAssignmentVersionConflictError,
  PostgresActorApplicationAssignmentStore,
  type ActorApplicationAssignment,
  type ChangeActorApplicationAssignmentInput,
} from "./postgres-actor-application-assignment-store.js";

export {
  PostgresTenantApplicationAssignmentStore,
  TenantApplicationAssignmentVersionConflictError,
  type TenantApplicationAssignment,
  type ChangeTenantApplicationAssignmentInput,
} from "./postgres-tenant-application-assignment-store.js";
