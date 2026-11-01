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

export {
  PostgresCustomerIdentitySessionStore,
  type CustomerOidcSubjectBinding,
  type CustomerBrowserSession,
  type CreateCustomerBrowserSessionInput,
} from "./postgres-customer-identity-session-store.js";

export {
  ProviderNeutralOidcClient,
  type OidcLoginTransactionStore,
  type ProviderNeutralOidcConfig,
} from "./provider-neutral-oidc-client.js";

export {
  CUSTOMER_OIDC_STATE_COOKIE,
  CUSTOMER_OIDC_STATE_MAX_AGE_SECONDS,
  normalizeCustomerReturnPath,
  serializeClearedCustomerOidcStateCookie,
  serializeCustomerOidcStateCookie,
  verifyCustomerOidcBrowserState,
} from "./customer-oidc-browser-flow.js";

export {
  completeCustomerOidcBrowserLogin,
  type CompleteCustomerOidcBrowserLoginInput,
  type CustomerOidcCallbackClient,
} from "./customer-oidc-callback.js";
