import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createAppServer } from "./server.js";
import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import { PostgresCommercialTariffAdminStore } from "../../packages/pricing/postgres-commercial-tariff-admin-store.js";
import { PostgresCustomerLifecycleStore } from "../../packages/identity/postgres-customer-lifecycle-store.js";
import { PostgresAdminConfigurationStore } from "../../packages/workflows/postgres-admin-configuration-store.js";
import { PostgresWorkflowRoleDefinitionStore } from "../../packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../../packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { PostgresWorkflowRoleDelegationStore } from "../../packages/workflows/postgres-workflow-role-delegation-store.js";
import { PostgresPlatformCustomerAdminProvisioningStore } from "../../packages/workflows/postgres-platform-customer-admin-provisioning-store.js";
import { PostgresPlatformApplicationRemediationStore } from "../../packages/workflows/postgres-platform-application-remediation-store.js";
import { WorkflowDefinitionPublisher } from "../../packages/workflows/workflow-definition-publisher.js";
import { PostgresWorkflowDefinitionDraftStore } from "../../packages/workflows/postgres-workflow-definition-draft-store.js";
import { PostgresWorkflowExecutionService } from "../../packages/workflows/postgres-workflow-execution-service.js";
import { PostgresModuleEntitlementService } from "../../packages/workflows/postgres-module-entitlement-service.js";
import { appendAuditEvent, appendAuditEventInTransaction, assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { PostgresTicketStore, createCanonicalTicketAuditWriter } from "../../packages/ticketing/postgres-ticket-store.js";
import { PostgresAgentDraftStore } from "../../packages/agents/postgres-agent-draft-store.js";
import { PostgresCampaignSchedulerStore } from "../../packages/campaign-scheduler/postgres-campaign-scheduler-store.js";
import { PostgresActorApplicationAssignmentStore } from "../../packages/identity/postgres-actor-application-assignment-store.js";
import { PostgresTenantApplicationAssignmentStore } from "../../packages/identity/postgres-tenant-application-assignment-store.js";
import { PostgresCustomerIdentitySessionStore } from "../../packages/identity/postgres-customer-identity-session-store.js";
import { PostgresCustomerAssetRepository } from "../../packages/assets/postgres-customer-asset-repository.js";
import { PostgresPlatformAdminCredentialStore } from "../../packages/identity/postgres-platform-admin-credential-store.js";
import { ProviderNeutralOidcClient } from "../../packages/identity/provider-neutral-oidc-client.js";
import { PostgresProviderConnectionRepository } from "../../packages/integrations/postgres-provider-connection-repository.js";
import { PostgresProviderValidationStore } from "../../packages/integrations/postgres-provider-validation-store.js";
import { ProviderConnectionValidationService } from "../../packages/integrations/provider-connection-validation-service.js";
import { SyntheticProviderSecretResolver, SyntheticProviderValidationAdapterRegistry } from "../../packages/integrations/synthetic-provider-validation-adapters.js";
import { PostgresProviderCatalogueRepository } from "../../packages/integrations/postgres-provider-catalogue-repository.js";
import { readProviderStorageRuntimeConfiguration } from "../../packages/integrations/provider-storage-runtime-configuration.js";
import { createConfiguredHttpInvoiceAmountSource } from "../../packages/payments/http-invoice-amount-source.js";
import { createConfiguredHttpTransactionSnapshotSource } from "../../packages/payments/http-transaction-snapshot-source.js";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const postgresPaymentMode = process.env.EPER_PAYMENT_PERSISTENCE === "postgres";
const postgresCapabilityMode = process.env.EPER_CAPABILITY_PERSISTENCE === "postgres";
const workflowExecutionEnabled = process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED === "true";
const providerConnectionsEnabled = process.env.EPER_PROVIDER_CONNECTION_API_ENABLED === "true";
const providerValidationEnabled = process.env.EPER_PROVIDER_VALIDATION_API_ENABLED === "true";
const workflowRoleDelegationEnabled = process.env.EPER_WORKFLOW_ROLE_DELEGATION_API_ENABLED === "true";
const platformCustomerAdminEnabled = process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED === "true";
const platformApplicationRemediationEnabled = process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED === "true";
const platformAdminCredentialsEnabled = process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED === "true";
const providerCatalogueAdminEnabled = process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED === "true";
const workflowOutboxAdminEnabled = process.env.EPER_WORKFLOW_OUTBOX_ADMIN_API_ENABLED === "true";
const commercialTariffAdminEnabled = process.env.EPER_COMMERCIAL_TARIFF_API_ENABLED === "true";
const customerLifecycleApiEnabled = process.env.EPER_CUSTOMER_LIFECYCLE_API_ENABLED === "true";
const customerIdentityPersistenceMode = process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE ?? "disabled";
const customerAssetUploadApiEnabled = process.env.EPER_CUSTOMER_ASSET_UPLOAD_API_ENABLED === "true";
const customerAssetMetadataApiEnabled = process.env.EPER_CUSTOMER_ASSET_METADATA_API_ENABLED === "true";
const customerAssetPersistenceApiEnabled = customerAssetUploadApiEnabled || customerAssetMetadataApiEnabled;
const providerStorageRuntimeConfiguration = readProviderStorageRuntimeConfiguration(process.env);
if (providerStorageRuntimeConfiguration.enabled) {
  // Runtime contracts are implemented, but no approved real provider drivers or secret-manager adapter are wired into this entrypoint yet.
  throw new Error("PROVIDER_STORAGE_RUNTIME_EXECUTION_NOT_COMPOSED");
}
if (customerIdentityPersistenceMode !== "disabled" && customerIdentityPersistenceMode !== "postgres") {
  throw new Error("EPER_CUSTOMER_IDENTITY_PERSISTENCE_UNSUPPORTED");
}
const postgresDatabaseMode = postgresPaymentMode || postgresCapabilityMode || workflowExecutionEnabled || workflowRoleDelegationEnabled || workflowOutboxAdminEnabled || commercialTariffAdminEnabled || customerLifecycleApiEnabled || platformCustomerAdminEnabled || platformApplicationRemediationEnabled || platformAdminCredentialsEnabled || providerCatalogueAdminEnabled || providerConnectionsEnabled || customerIdentityPersistenceMode === "postgres" || customerAssetPersistenceApiEnabled;
const paymentPool = postgresDatabaseMode ? createPostgresPaymentPool() : null;

// Privileged control-plane stores use independent PostgreSQL credentials and pools.
// Configure these URLs with separate least-privilege roles and explicit table grants;
// they must not silently fall back to the general payment/database credential.
const platformAdminPool = platformAdminCredentialsEnabled ? (() => {
  const connectionString = process.env.EPER_PLATFORM_ADMIN_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("EPER_PLATFORM_ADMIN_DATABASE_URL_REQUIRED");
  return createPostgresPaymentPool({ ...process.env, EPER_PAYMENT_DATABASE_URL: connectionString, DATABASE_URL: undefined });
})() : null;
const providerCataloguePool = (providerCatalogueAdminEnabled || providerConnectionsEnabled) ? (() => {
  const connectionString = process.env.EPER_PROVIDER_CATALOGUE_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("EPER_PROVIDER_CATALOGUE_DATABASE_URL_REQUIRED");
  return createPostgresPaymentPool({ ...process.env, EPER_PAYMENT_DATABASE_URL: connectionString, DATABASE_URL: undefined });
})() : null;

async function assertPrivilegedPoolRole(
  pool: ReturnType<typeof createPostgresPaymentPool> | null,
  expectedRole: string,
  protectedTables: string[],
  failureCode: string,
): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    const result = await client.query<{
      is_member: boolean;
      can_login: boolean;
      is_superuser: boolean;
      bypass_rls: boolean;
      owns_protected_tables: boolean;
    }>(`
      SELECT
        COALESCE((SELECT pg_has_role(current_user, r.oid, 'member')
                    FROM pg_roles r WHERE r.rolname = $1), FALSE) AS is_member,
        current_role.rolcanlogin AS can_login,
        current_role.rolsuper AS is_superuser,
        current_role.rolbypassrls AS bypass_rls,
        EXISTS (
          SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND c.relname = ANY($2::text[])
             AND pg_has_role(current_user, c.relowner, 'member')
        ) AS owns_protected_tables
      FROM pg_roles current_role
      WHERE current_role.rolname = current_user
    `, [expectedRole, protectedTables]);
    const role = result.rows[0];
    if (!role || role.is_member !== true || role.can_login !== true ||
        role.is_superuser !== false || role.bypass_rls !== false ||
        role.owns_protected_tables === true) {
      throw new Error(failureCode);
    }
  } finally {
    client.release();
  }
}

if (platformAdminPool) {
  await assertPrivilegedPoolRole(
    platformAdminPool,
    "eper_platform_admin_access",
    ["eper_platform_admin_credentials", "eper_audit_events", "eper_audit_chain_head"],
    "EPER_PLATFORM_ADMIN_DATABASE_ROLE_INVALID",
  );
}
if (providerCataloguePool) {
  await assertPrivilegedPoolRole(
    providerCataloguePool,
    "eper_provider_catalogue_access",
    [
      "eper_provider_definitions", "eper_provider_connections",
      "eper_provider_connection_applications", "eper_provider_validation_events",
      "eper_tenant_provider_defaults", "eper_application_provider_policies",
      "eper_provider_operations", "eper_audit_events", "eper_audit_chain_head",
    ],
    "EPER_PROVIDER_CATALOGUE_DATABASE_ROLE_INVALID",
  );
}
const paymentStore = postgresPaymentMode && paymentPool ? new PostgresPaymentStore(paymentPool, true) : undefined;
if (commercialTariffAdminEnabled && (!paymentPool || process.env.EPER_AUDIT_PERSISTENCE !== "postgres" ||
    process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" || process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres")) {
  throw new Error("COMMERCIAL_TARIFF_ADMIN_REQUIRES_POSTGRES_ADMIN_CONFIG_AND_DURABLE_AUDIT");
}
const commercialTariffAdminStore = commercialTariffAdminEnabled && paymentPool
  ? new PostgresCommercialTariffAdminStore(paymentPool)
  : undefined;
if (commercialTariffAdminStore) await commercialTariffAdminStore.assertReady();

if (customerLifecycleApiEnabled && (!paymentPool || process.env.EPER_AUDIT_PERSISTENCE !== "postgres" ||
    process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" || process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres")) {
  throw new Error("CUSTOMER_LIFECYCLE_API_REQUIRES_POSTGRES_ADMIN_CONFIG_AND_DURABLE_AUDIT");
}
const customerLifecycleStore = customerLifecycleApiEnabled && paymentPool
  ? new PostgresCustomerLifecycleStore(paymentPool)
  : undefined;
if (customerLifecycleStore) await customerLifecycleStore.assertReady();

const adminConfigMode = process.env.EPER_ADMIN_CONFIG_PERSISTENCE ?? "memory";
if (adminConfigMode !== "memory" && adminConfigMode !== "postgres") {
  throw new Error("EPER_ADMIN_CONFIG_PERSISTENCE_UNSUPPORTED");
}
if (adminConfigMode === "postgres" && (!paymentPool || process.env.EPER_AUDIT_PERSISTENCE !== "postgres")) {
  throw new Error("EPER_ADMIN_CONFIG_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
const adminConfigurationStore = adminConfigMode === "postgres" && paymentPool
  ? new PostgresAdminConfigurationStore(paymentPool)
  : undefined;

const moduleEntitlementMode = process.env.EPER_MODULE_ENTITLEMENT_PERSISTENCE ?? "disabled";
if (moduleEntitlementMode !== "disabled" && moduleEntitlementMode !== "postgres") {
  throw new Error("EPER_MODULE_ENTITLEMENT_PERSISTENCE_UNSUPPORTED");
}
if (moduleEntitlementMode === "postgres" && (!paymentPool || process.env.EPER_AUDIT_PERSISTENCE !== "postgres")) {
  throw new Error("EPER_MODULE_ENTITLEMENT_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
function readApplicationAssignments(): Record<string, string[]> {
  let value: unknown;
  try { value = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); }
  catch { throw new Error("EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON_INVALID"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON_REQUIRED");
  }
  const assignments: Record<string, string[]> = {};
  for (const [tenantId, applicationIds] of Object.entries(value as Record<string, unknown>)) {
    if (!tenantId.trim() || tenantId.length > 128 || !Array.isArray(applicationIds) ||
        applicationIds.some((applicationId) => typeof applicationId !== "string" || !applicationId.trim() || applicationId.length > 128)) {
      throw new Error("EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON_INVALID");
    }
    assignments[tenantId] = [...new Set(applicationIds as string[])];
  }
  return assignments;
}
let tenantApplicationAssignmentStoreForEntitlements: PostgresTenantApplicationAssignmentStore | undefined;
const moduleEntitlementService = moduleEntitlementMode === "postgres" && paymentPool
  ? new PostgresModuleEntitlementService(paymentPool, {
      async isAssignedToTenant(tenantId, applicationId) {
        if (process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE === "postgres") {
          if (!tenantApplicationAssignmentStoreForEntitlements) throw new Error("TENANT_APPLICATION_ASSIGNMENT_STORE_NOT_READY");
          return (await tenantApplicationAssignmentStoreForEntitlements.listActive(tenantId)).includes(applicationId);
        }
        const assignments = readApplicationAssignments();
        return assignments[tenantId]?.includes(applicationId) === true;
      },
    })
  : undefined;
if (moduleEntitlementMode === "postgres" && moduleEntitlementService) {
  await moduleEntitlementService.assertReady();
}
// Receipt numbering is an explicit operator/business configuration. Never silently
// choose a receipt-numbering policy; capture routes fail closed when the prefix is absent.
const receiptPrefix = process.env.EPER_PAYMENT_RECEIPT_NUMBER_PREFIX?.trim();
const receiptNumberSource = receiptPrefix && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,19}$/.test(receiptPrefix)
  ? async () => `${receiptPrefix}-${new Date().getUTCFullYear()}-${randomUUID().toUpperCase()}`
  : undefined;
const invoiceAmountSource = createConfiguredHttpInvoiceAmountSource();
const transactionSnapshotSource = createConfiguredHttpTransactionSnapshotSource();
const auditMode = process.env.EPER_AUDIT_PERSISTENCE ?? "disabled";
if (process.env.NODE_ENV === "production" && process.env.EPER_AGENTS_API_ENABLED === "true" && auditMode !== "postgres") {
  throw new Error("PRODUCTION_AGENT_API_REQUIRES_DURABLE_AUDIT");
}
if (auditMode !== "disabled" && auditMode !== "postgres") {
  throw new Error("EPER_AUDIT_PERSISTENCE_UNSUPPORTED");
}
if (auditMode === "postgres" && !paymentPool) {
  throw new Error("EPER_AUDIT_REQUIRES_POSTGRES_PAYMENT_PERSISTENCE");
}
if (customerIdentityPersistenceMode === "postgres" && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("CUSTOMER_IDENTITY_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
if ((platformCustomerAdminEnabled || platformApplicationRemediationEnabled || platformAdminCredentialsEnabled) && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("PLATFORM_CUSTOMER_ADMIN_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
const auditEnvironment = process.env.EPER_AUDIT_ENVIRONMENT ?? "uat";
if (!["production", "uat", "sandbox"].includes(auditEnvironment)) {
  throw new Error("EPER_AUDIT_ENVIRONMENT_INVALID");
}
const actorAssignmentMode = process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE ?? "environment";
if (actorAssignmentMode !== "environment" && actorAssignmentMode !== "postgres") {
  throw new Error("EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE_UNSUPPORTED");
}
if (actorAssignmentMode === "postgres" && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("CUSTOMER_ACTOR_ASSIGNMENTS_REQUIRE_POSTGRES_AND_DURABLE_AUDIT");
}
if ((platformCustomerAdminEnabled || platformApplicationRemediationEnabled || platformAdminCredentialsEnabled) && (!paymentPool || auditMode !== "postgres" ||
    customerIdentityPersistenceMode !== "postgres" || actorAssignmentMode !== "postgres")) {
  throw new Error("PLATFORM_CUSTOMER_ADMIN_REQUIRES_POSTGRES_IDENTITY_ASSIGNMENTS_AND_DURABLE_AUDIT");
}
if (customerAssetUploadApiEnabled && (!paymentPool || auditMode !== "postgres" ||
    customerIdentityPersistenceMode !== "postgres" || actorAssignmentMode !== "postgres" ||
    process.env.EPER_CUSTOMER_OIDC_ENABLED !== "true")) {
  throw new Error("CUSTOMER_ASSET_UPLOAD_REQUIRES_POSTGRES_IDENTITY_ASSIGNMENTS_OIDC_AND_DURABLE_AUDIT");
}
if (customerAssetMetadataApiEnabled && (!paymentPool || auditMode !== "postgres" ||
    customerIdentityPersistenceMode !== "postgres" || actorAssignmentMode !== "postgres" ||
    process.env.EPER_CUSTOMER_OIDC_ENABLED !== "true")) {
  throw new Error("CUSTOMER_ASSET_METADATA_API_REQUIRES_POSTGRES_IDENTITY_ASSIGNMENTS_OIDC_AND_DURABLE_AUDIT");
}
if (customerIdentityPersistenceMode === "postgres" && actorAssignmentMode !== "postgres") {
  throw new Error("CUSTOMER_IDENTITY_REQUIRES_DURABLE_TENANT_AND_ACTOR_APPLICATION_ASSIGNMENTS");
}
if (workflowExecutionEnabled && (!paymentPool || auditMode !== "postgres" ||
    actorAssignmentMode !== "postgres" || adminConfigMode !== "postgres")) {
  throw new Error("WORKFLOW_EXECUTION_REQUIRES_POSTGRES_AUDIT_AND_DURABLE_ADMIN_ASSIGNMENTS");
}
if (workflowOutboxAdminEnabled && (!paymentPool || auditMode !== "postgres" ||
    actorAssignmentMode !== "postgres" || adminConfigMode !== "postgres" ||
    process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true")) {
  throw new Error("WORKFLOW_OUTBOX_ADMIN_REQUIRES_POSTGRES_AUDIT_AND_DURABLE_ADMIN_ASSIGNMENTS");
}
const actorApplicationAssignmentStore = actorAssignmentMode === "postgres" && paymentPool
  ? new PostgresActorApplicationAssignmentStore(paymentPool)
  : undefined;
if (actorApplicationAssignmentStore) await actorApplicationAssignmentStore.assertReady();
const tenantApplicationAssignmentStore = actorAssignmentMode === "postgres" && paymentPool
  ? new PostgresTenantApplicationAssignmentStore(paymentPool)
  : undefined;
if (tenantApplicationAssignmentStore) await tenantApplicationAssignmentStore.assertReady();
tenantApplicationAssignmentStoreForEntitlements = tenantApplicationAssignmentStore;
const customerIdentitySessionStore = customerIdentityPersistenceMode === "postgres" && paymentPool
  ? new PostgresCustomerIdentitySessionStore(paymentPool)
  : undefined;
if (customerIdentitySessionStore) await customerIdentitySessionStore.assertReady();

const customerOidcEnabled = process.env.EPER_CUSTOMER_OIDC_ENABLED === "true";
let customerOidcClient: ProviderNeutralOidcClient | undefined;
let customerOidcPublicOrigin: string | undefined;
let customerCsrfSecret: string | undefined;
if (customerOidcEnabled) {
  if (customerIdentityPersistenceMode !== "postgres" || !customerIdentitySessionStore ||
      actorAssignmentMode !== "postgres" || !tenantApplicationAssignmentStore || auditMode !== "postgres") {
    throw new Error("CUSTOMER_OIDC_REQUIRES_POSTGRES_IDENTITY_ASSIGNMENTS_AND_DURABLE_AUDIT");
  }
  const issuer = process.env.EPER_CUSTOMER_OIDC_ISSUER?.trim();
  const clientId = process.env.EPER_CUSTOMER_OIDC_CLIENT_ID?.trim();
  const redirectUri = process.env.EPER_CUSTOMER_OIDC_REDIRECT_URI?.trim();
  const pkceEncryptionKey = process.env.EPER_CUSTOMER_OIDC_PKCE_ENCRYPTION_KEY;
  customerOidcPublicOrigin = process.env.EPER_CUSTOMER_OIDC_PUBLIC_ORIGIN?.trim();
  customerCsrfSecret = process.env.EPER_CUSTOMER_CSRF_SECRET;
  if (!issuer || !clientId || !redirectUri || !pkceEncryptionKey || pkceEncryptionKey.length < 32 ||
      !customerOidcPublicOrigin || !customerCsrfSecret || customerCsrfSecret.length < 32) {
    throw new Error("CUSTOMER_OIDC_CONFIGURATION_INCOMPLETE");
  }
  let publicOrigin: URL;
  try { publicOrigin = new URL(customerOidcPublicOrigin); } catch { throw new Error("CUSTOMER_OIDC_PUBLIC_ORIGIN_INVALID"); }
  const localHttp = publicOrigin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(publicOrigin.hostname);
  if ((publicOrigin.protocol !== "https:" && !localHttp) || publicOrigin.origin !== customerOidcPublicOrigin ||
      publicOrigin.username || publicOrigin.password || publicOrigin.hash) {
    throw new Error("CUSTOMER_OIDC_PUBLIC_ORIGIN_INVALID");
  }
  let callbackUrl: URL;
  try { callbackUrl = new URL(redirectUri); } catch { throw new Error("CUSTOMER_OIDC_REDIRECT_URI_INVALID"); }
  if (callbackUrl.origin !== publicOrigin.origin || callbackUrl.pathname !== "/customer/auth/oidc/callback" ||
      callbackUrl.search || callbackUrl.hash || callbackUrl.username || callbackUrl.password) {
    throw new Error("CUSTOMER_OIDC_REDIRECT_URI_INVALID");
  }
  if (process.env.NODE_ENV === "production" && !customerOidcPublicOrigin.startsWith("https://")) {
    throw new Error("PRODUCTION_CUSTOMER_OIDC_REQUIRES_HTTPS_PUBLIC_ORIGIN");
  }
  customerOidcClient = new ProviderNeutralOidcClient({
    issuer, clientId, redirectUri, pkceEncryptionKey,
    clientSecret: process.env.EPER_CUSTOMER_OIDC_CLIENT_SECRET || undefined,
  });
}

if ((providerConnectionsEnabled || providerValidationEnabled) && (!paymentPool || auditMode !== "postgres" ||
    customerIdentityPersistenceMode !== "postgres" || actorAssignmentMode !== "postgres")) {
  throw new Error("PROVIDER_CONNECTION_API_REQUIRES_POSTGRES_AUDIT_AND_DURABLE_CUSTOMER_IDENTITY_ASSIGNMENTS");
}

if (providerCatalogueAdminEnabled && (!paymentPool || auditMode !== "postgres" ||
    !platformAdminCredentialsEnabled || process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED !== "true")) {
  throw new Error("PROVIDER_CATALOGUE_ADMIN_REQUIRES_POSTGRES_DURABLE_AUDIT_AND_PLATFORM_CREDENTIALS");
}
function readProviderCatalogueRegistry(name: string): string[] {
  let value: unknown;
  try { value = JSON.parse(process.env[name] ?? ""); }
  catch { throw new Error(`${name}_INVALID_JSON`); }
  if (!Array.isArray(value) || value.length < 1 || value.length > 128 ||
      value.some(item => typeof item !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(item)) ||
      new Set(value).size !== value.length) {
    throw new Error(`${name}_INVALID_REGISTRY`);
  }
  return value as string[];
}
const providerCatalogueRepository = (providerCatalogueAdminEnabled || providerConnectionsEnabled) && providerCataloguePool
  ? new PostgresProviderCatalogueRepository(providerCataloguePool, {
      adapterKeys: readProviderCatalogueRegistry("EPER_PROVIDER_CATALOGUE_ADAPTER_KEYS_JSON"),
      capabilityKeys: readProviderCatalogueRegistry("EPER_PROVIDER_CATALOGUE_CAPABILITY_KEYS_JSON"),
      authModes: readProviderCatalogueRegistry("EPER_PROVIDER_CATALOGUE_AUTH_MODES_JSON"),
    }, process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID)
  : undefined;
if (providerCatalogueRepository) {
  const readinessClient = await providerCataloguePool!.connect();
  try {
    const readiness = await readinessClient.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.eper_provider_definitions')::text AS table_name",
    );
    if (!readiness.rows[0]?.table_name) throw new Error("PROVIDER_CATALOGUE_SCHEMA_NOT_APPLIED");
  } finally {
    readinessClient.release();
  }
}

const providerConnectionRepository = providerConnectionsEnabled && paymentPool
  ? new PostgresProviderConnectionRepository(paymentPool)
  : undefined;
if (providerValidationEnabled && (process.env.NODE_ENV === "production" || !providerConnectionsEnabled ||
    process.env.EPER_PROVIDER_VALIDATION_MODE !== "synthetic")) {
  throw new Error("PROVIDER_VALIDATION_API_REQUIRES_PROVIDER_API_AND_EXPLICIT_SYNTHETIC_MODE");
}
const providerValidationService = providerValidationEnabled && paymentPool
  ? new ProviderConnectionValidationService(
      new PostgresProviderValidationStore(paymentPool),
      new SyntheticProviderSecretResolver(),
      new SyntheticProviderValidationAdapterRegistry(),
    )
  : undefined;

const workflowAuthorizationStoresEnabled = workflowExecutionEnabled || workflowOutboxAdminEnabled || workflowRoleDelegationEnabled || platformCustomerAdminEnabled || providerConnectionsEnabled || providerValidationEnabled || customerAssetPersistenceApiEnabled;
const workflowRoleDefinitionStore = workflowAuthorizationStoresEnabled && paymentPool
  ? new PostgresWorkflowRoleDefinitionStore(paymentPool)
  : undefined;
const workflowActorRoleAssignmentStore = workflowAuthorizationStoresEnabled && paymentPool
  ? new PostgresWorkflowActorRoleAssignmentStore(paymentPool)
  : undefined;
const workflowDefinitionPublisher = workflowExecutionEnabled && paymentPool
  ? new WorkflowDefinitionPublisher(paymentPool)
  : undefined;
const workflowDefinitionDraftStore = workflowExecutionEnabled && paymentPool
  ? new PostgresWorkflowDefinitionDraftStore(paymentPool)
  : undefined;
const workflowExecutionService = workflowExecutionEnabled && paymentPool
  ? new PostgresWorkflowExecutionService(paymentPool, process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID)
  : undefined;
if (workflowRoleDelegationEnabled && (!paymentPool || auditMode !== "postgres" ||
    customerIdentityPersistenceMode !== "postgres" || actorAssignmentMode !== "postgres" ||
    !tenantApplicationAssignmentStore || !actorApplicationAssignmentStore)) {
  throw new Error("WORKFLOW_ROLE_DELEGATION_REQUIRES_POSTGRES_IDENTITY_ASSIGNMENTS_AND_DURABLE_AUDIT");
}
const workflowRoleDelegationStore = workflowRoleDelegationEnabled && paymentPool
  ? new PostgresWorkflowRoleDelegationStore(paymentPool)
  : undefined;
const customerAssetRepository = customerAssetPersistenceApiEnabled && paymentPool
  ? new PostgresCustomerAssetRepository(paymentPool)
  : undefined;
if (customerAssetRepository) await customerAssetRepository.assertReady();
if (workflowRoleDefinitionStore) await workflowRoleDefinitionStore.assertReady();
if (workflowActorRoleAssignmentStore) await workflowActorRoleAssignmentStore.assertReady();
if (workflowDefinitionDraftStore) await workflowDefinitionDraftStore.assertReady();
if (workflowExecutionService) await workflowExecutionService.assertReady();
const platformCustomerAdminProvisioningStore = platformCustomerAdminEnabled && paymentPool
  ? new PostgresPlatformCustomerAdminProvisioningStore(paymentPool)
  : undefined;
if (platformCustomerAdminProvisioningStore) await platformCustomerAdminProvisioningStore.assertReady();
const platformApplicationRemediationStore = platformApplicationRemediationEnabled && paymentPool
  ? new PostgresPlatformApplicationRemediationStore(paymentPool)
  : undefined;
if (platformApplicationRemediationStore) await platformApplicationRemediationStore.assertReady();

const auditWriter = auditMode === "postgres" && paymentPool
  ? async (record: import("../../packages/agents/agent-workflows.js").AgentAuditRecord): Promise<void> => {
      await appendAuditEvent(paymentPool, {
        tenantId: record.tenantId,
        applicationId: record.applicationId ?? "eper",
        environment: auditEnvironment as "production" | "uat" | "sandbox",
        actorType: record.actorId === "anonymous" ? "system" : "human",
        actorId: record.actorId,
        action: record.action,
        outcome: record.outcome,
        reasonCode: record.outcome === "denied" ? "request_denied" : undefined,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        requestId: record.requestId,
        source: "api",
        operationName: record.operationName,
        serviceVersion: process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
        payload: record.payload,
      });
    }
  : undefined;

const assetAuditWriter = auditMode === "postgres" && paymentPool
  ? async (record: import("./server.js").CustomerAssetAuditRecord): Promise<void> => {
      await appendAuditEvent(paymentPool, {
        tenantId: record.tenantId,
        applicationId: record.applicationId,
        environment: auditEnvironment as "production" | "uat" | "sandbox",
        actorType: "human",
        actorId: record.actorId,
        action: record.action,
        outcome: record.outcome,
        reasonCode: record.outcome === "denied" ? "ASSET_ACCESS_DENIED" :
          record.outcome === "failure" ? "ASSET_DOWNLOAD_FAILED" : undefined,
        resourceType: "client-asset",
        resourceId: record.assetId,
        requestId: record.requestId,
        source: "api",
        operationName: "customer.asset.download",
        serviceVersion: process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
        payload: { applicationId: record.applicationId },
      });
    }
  : undefined;
if (auditMode === "postgres" && paymentPool) {
  await assertAuditStoreReady(paymentPool);
}

const agentsEnabled = process.env.EPER_AGENTS_API_ENABLED === "true";
if (agentsEnabled && (!paymentPool || adminConfigMode !== "postgres" || auditMode !== "postgres")) {
  throw new Error("AGENTS_API_REQUIRES_POSTGRES_CONFIGURATION_AND_DURABLE_AUDIT");
}
const agentDraftStore = agentsEnabled && paymentPool ? new PostgresAgentDraftStore(paymentPool, auditEnvironment as "production" | "uat" | "sandbox", process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID) : undefined;
if (agentDraftStore) await agentDraftStore.assertReady();

const campaignSchedulerEnabled = process.env.EPER_CAMPAIGN_SCHEDULER_API_ENABLED === "true";
if (campaignSchedulerEnabled && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("CAMPAIGN_SCHEDULER_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
const campaignSchedulerStore = campaignSchedulerEnabled && paymentPool
  ? new PostgresCampaignSchedulerStore(paymentPool, auditEnvironment as "production" | "uat" | "sandbox", process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID)
  : undefined;
if (campaignSchedulerStore) await campaignSchedulerStore.assertReady();

const ticketingEnabled = process.env.EPER_TICKETING_API_ENABLED === "true";
if (ticketingEnabled && (!paymentPool || auditMode !== "postgres")) {
  throw new Error("TICKETING_API_REQUIRES_POSTGRES_AND_DURABLE_AUDIT");
}
const ticketStore = ticketingEnabled && paymentPool
  ? new PostgresTicketStore(
      paymentPool,
      createCanonicalTicketAuditWriter(
        auditEnvironment as "production" | "uat" | "sandbox",
        process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
      ),
    )
  : undefined;
if (ticketStore) await ticketStore.assertReady();

if (adminConfigMode === "postgres" && adminConfigurationStore) {
  await adminConfigurationStore.assertReady();
}

const platformAdminCredentialStore = platformAdminCredentialsEnabled && platformAdminPool
  ? new PostgresPlatformAdminCredentialStore(platformAdminPool, process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID)
  : undefined;
if (platformAdminCredentialStore) await platformAdminCredentialStore.assertReady();

const server = createAppServer({
  capabilityPool: (postgresCapabilityMode || workflowOutboxAdminEnabled) ? paymentPool as unknown as Pool : undefined,
  paymentStore, invoiceAmountSource, receiptNumberSource, transactionSnapshotSource, auditWriter, assetAuditWriter, customerLifecycleStore,
  agentDraftStore, ticketStore, actorApplicationAssignmentStore, tenantApplicationAssignmentStore, customerIdentitySessionStore,
  customerOidcClient, customerOidcPublicOrigin, customerCsrfSecret, adminConfigurationStore, commercialTariffAdminStore, moduleEntitlementService, campaignSchedulerStore,
  adminConfigEnvironment: auditEnvironment as "production" | "uat" | "sandbox",
  serviceVersion: process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
  workflowRoleDefinitionStore, workflowActorRoleAssignmentStore, workflowRoleDelegationStore, customerAssetRepository, platformCustomerAdminProvisioningStore, platformApplicationRemediationStore, platformAdminCredentialStore,
  providerConnectionRepository, providerValidationService, providerCatalogueRepository,
  workflowDefinitionPublisher, workflowDefinitionDraftStore, workflowExecutionService,
});

server.listen(port, host, () => {
  console.log(`EPER API listening on ${host}:${port}`);
});

async function shutdown(signal: string): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
    if (paymentPool) await paymentPool.end();
    if (platformAdminPool) await platformAdminPool.end();
    if (providerCataloguePool) await providerCataloguePool.end();
  } catch (error) {
    console.error(`EPER API shutdown failed after ${signal}`, error);
    process.exitCode = 1;
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void shutdown(signal); });
}
