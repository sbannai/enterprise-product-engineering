import { createCustomerAssetScanChildCleanupRegistry } from "./customer-asset-scan-child-cleanup.js";
import type { CustomerAssetScanChildDatabaseTlsBootstrap } from "./customer-asset-scan-child-database-tls-bootstrap-contract.js";
import type { CustomerAssetScanChildRuntimeDependenciesFactory, CustomerAssetScanChildRuntimeComposition } from "./customer-asset-scan-child-composition-contract.js";
import { PostgresCustomerAssetScanChildInputResolver, type CustomerAssetScanChildSqlExecutor } from "./customer-asset-scan-child-input-resolver.js";
import { CustomerAssetScanChildSpiffeIdentityVerifier, type SpiffeWorkloadApiClient } from "./customer-asset-scan-child-spiffe-identity.js";
import type { CustomerAssetScanChildRuntimeDependencies } from "./customer-asset-scan-child-runtime.js";
import type { CustomerAssetScanChildDatabaseCredentialIssuer } from "./customer-asset-scan-child-database-credential-issuer.js";

type DatabaseIssuer = Pick<CustomerAssetScanChildDatabaseCredentialIssuer, "issue">;
type RuntimeProvider = CustomerAssetScanChildRuntimeDependencies["provider"];
type RuntimeScanner = CustomerAssetScanChildRuntimeDependencies["scanner"];

export interface CustomerAssetScanDeploymentIdentityServices {
  readonly workloadApiClient: SpiffeWorkloadApiClient;
  readonly expectedSpiffeId: string;
  readonly issuer: DatabaseIssuer;
  readonly caPem: string;
  readonly databaseCaPem: string;
  /** Optional disposer for resources acquired while constructing these services. */
  readonly close?: () => void | Promise<void>;
}

export interface CustomerAssetScanDeploymentRuntimeServices {
  readonly provider: RuntimeProvider;
  readonly scanner: RuntimeScanner;
  /** Optional disposer for provider/scanner resources acquired by this factory. */
  readonly close?: () => void | Promise<void>;
}

/**
 * The only platform-specific seam in the scanner child composition.
 *
 * A Docker, Kubernetes, VM, managed-container or future adapter implements
 * these two factories. It owns the mechanics of reaching its workload-identity
 * endpoint and secret/configuration facilities; EPER owns the identity,
 * authorization, database, stream-verification and scan contracts.
 *
 * Factories MUST register each resource disposer immediately after acquisition.
 * This is what makes partial initialization and cancellation cleanup-safe.
 */
export interface CustomerAssetScanDeploymentHost {
  createIdentityServices(input: {
    readonly env: NodeJS.ProcessEnv;
    readonly signal: AbortSignal;
    readonly registerCleanup: (cleanup: () => void | Promise<void>) => void;
  }): Promise<CustomerAssetScanDeploymentIdentityServices> | CustomerAssetScanDeploymentIdentityServices;

  createRuntimeServices(input: {
    readonly pool: CustomerAssetScanChildSqlExecutor;
    readonly env: NodeJS.ProcessEnv;
    readonly identity: CustomerAssetScanChildRuntimeDependencies["identity"];
    readonly signal: AbortSignal;
    readonly registerCleanup: (cleanup: () => void | Promise<void>) => void;
  }): Promise<CustomerAssetScanDeploymentRuntimeServices> | CustomerAssetScanDeploymentRuntimeServices;
}

function assertIdentityServices(value: unknown): asserts value is CustomerAssetScanDeploymentIdentityServices {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CUSTOMER_ASSET_SCAN_DEPLOYMENT_IDENTITY_SERVICES_INVALID");
  }
  const candidate = value as Record<string, unknown>;
  const client = candidate.workloadApiClient as Record<string, unknown> | undefined;
  const issuer = candidate.issuer as Record<string, unknown> | undefined;
  if (!client || typeof client.fetchJwtSvid !== "function" ||
      typeof candidate.expectedSpiffeId !== "string" || !candidate.expectedSpiffeId.trim() ||
      !issuer || typeof issuer.issue !== "function" ||
      typeof candidate.caPem !== "string" || !candidate.caPem.trim() ||
      typeof candidate.databaseCaPem !== "string" || !candidate.databaseCaPem.trim() ||
      (candidate.close !== undefined && typeof candidate.close !== "function")) {
    throw new Error("CUSTOMER_ASSET_SCAN_DEPLOYMENT_IDENTITY_SERVICES_INVALID");
  }
}

function assertRuntimeServices(value: unknown): asserts value is CustomerAssetScanDeploymentRuntimeServices {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CUSTOMER_ASSET_SCAN_DEPLOYMENT_RUNTIME_SERVICES_INVALID");
  }
  const candidate = value as Record<string, unknown>;
  const provider = candidate.provider as Record<string, unknown> | undefined;
  const scanner = candidate.scanner as Record<string, unknown> | undefined;
  if (!provider || typeof provider.dispatch !== "function" ||
      !scanner || typeof scanner.scan !== "function" ||
      (candidate.close !== undefined && typeof candidate.close !== "function")) {
    throw new Error("CUSTOMER_ASSET_SCAN_DEPLOYMENT_RUNTIME_SERVICES_INVALID");
  }
}

/**
 * Adapt platform-owned facilities to the stable EPER scanner-child factories.
 *
 * This adapter deliberately does not import an orchestrator SDK, read a
 * platform-specific metadata endpoint, or decide how secrets are mounted.
 * Those concerns stay behind CustomerAssetScanDeploymentHost so a platform
 * can be selected later without changing scanner authorization or behavior.
 */
export function createCustomerAssetScanDeploymentAdapter(host: CustomerAssetScanDeploymentHost): {
  createCustomerAssetScanChildDatabaseTlsBootstrap: (input: {
    env: NodeJS.ProcessEnv;
    signal: AbortSignal;
    onStage?: (stage: "sdk" | "identity" | "issuer" | "ca") => void;
  }) => Promise<CustomerAssetScanChildDatabaseTlsBootstrap>;
  createCustomerAssetScanChildRuntimeDependencies: CustomerAssetScanChildRuntimeDependenciesFactory;
} {
  if (!host || typeof host.createIdentityServices !== "function" ||
      typeof host.createRuntimeServices !== "function") {
    throw new Error("CUSTOMER_ASSET_SCAN_DEPLOYMENT_HOST_INVALID");
  }

  const cleanup = createCustomerAssetScanChildCleanupRegistry();
  const close = () => cleanup.close();
  let identityVerifier: CustomerAssetScanChildRuntimeDependencies["identity"] | undefined;
  let bootstrapStarted = false;
  let runtimeStarted = false;

  return {
    async createCustomerAssetScanChildDatabaseTlsBootstrap(input) {
      if (bootstrapStarted) throw new Error("CUSTOMER_ASSET_SCAN_DEPLOYMENT_BOOTSTRAP_ALREADY_CREATED");
      bootstrapStarted = true;
      try {
        input.onStage?.("sdk");
        const services = await host.createIdentityServices({
          env: input.env,
          signal: input.signal,
          registerCleanup: cleanup.register,
        });
        assertIdentityServices(services);
        if (services.close) cleanup.register(services.close);

        input.onStage?.("identity");
        identityVerifier = new CustomerAssetScanChildSpiffeIdentityVerifier(
          services.workloadApiClient,
          services.expectedSpiffeId,
        );
        input.onStage?.("issuer");
        input.onStage?.("ca");
        return Object.freeze({
          identity: identityVerifier,
          issuer: services.issuer,
          caPem: services.caPem,
          databaseCaPem: services.databaseCaPem,
          close,
        });
      } catch (error) {
        await close();
        throw error;
      }
    },

    async createCustomerAssetScanChildRuntimeDependencies(input): Promise<CustomerAssetScanChildRuntimeComposition> {
      if (!identityVerifier || input.identity !== identityVerifier) {
        throw new Error("CUSTOMER_ASSET_SCAN_DEPLOYMENT_IDENTITY_MISMATCH");
      }
      if (runtimeStarted) throw new Error("CUSTOMER_ASSET_SCAN_DEPLOYMENT_RUNTIME_ALREADY_CREATED");
      runtimeStarted = true;

      const services = await host.createRuntimeServices({
        pool: input.pool,
        env: input.env,
        identity: identityVerifier,
        signal: input.signal,
        registerCleanup: cleanup.register,
      });
      assertRuntimeServices(services);
      if (services.close) cleanup.register(services.close);

      const composition: CustomerAssetScanChildRuntimeComposition = {
        identity: identityVerifier,
        input: new PostgresCustomerAssetScanChildInputResolver(input.pool),
        provider: services.provider,
        scanner: services.scanner,
        close,
      };
      return composition;
    },
  };
}
