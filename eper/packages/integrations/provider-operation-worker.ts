import type { AuditEnvironment } from "../audit/audit-event-store.js";
import type { ProviderDispatchSelection, ProviderDispatchConfigurationService } from "./provider-dispatch-configuration-service.js";
import type { ProviderOperation } from "./postgres-provider-operation-repository.js";

type Repository = {
  claimNext(input: { tenantId: string; applicationId: string; workerId: string; leaseDurationSeconds: number; maxAttempts: number; auditEnvironment: AuditEnvironment }): Promise<ProviderOperation | null>;
  recoverExpiredLeases(input: { tenantId: string; applicationId: string; maxAttempts: number; batchSize: number; auditEnvironment: AuditEnvironment }): Promise<ProviderOperation[]>;
  renewLease(input: { tenantId: string; applicationId: string; operationId: string; workerId: string; fencingToken: number; leaseDurationSeconds: number; auditEnvironment: AuditEnvironment }): Promise<ProviderOperation>;
  recordOutcome(input: { tenantId: string; applicationId: string; operationId: string; workerId: string; outcome: "SUCCEEDED" | "RETRY" | "FAILED" | "NEEDS_ATTENTION"; providerReference?: string; errorCode?: string; retryAfterSeconds?: number; maxAttempts: number; fencingToken: number; auditEnvironment: AuditEnvironment }): Promise<ProviderOperation>;
};
type PayloadStore = {
  get<T>(input: { tenantId: string; applicationId: string; operationId: string; capabilityKey: string; reference: string; digest: string }): Promise<T>;
};
export type ProviderOperationWorkerOptions = {
  tenantId: string;
  applicationId: string;
  workerId: string;
  auditEnvironment: AuditEnvironment;
  leaseDurationSeconds?: number;
  maxAttempts?: number;
  retryAfterSeconds?: number;
  batchSize?: number;
};
export type ProviderDispatchResult = { providerReference?: string };
export type ProviderOperationWorkerDependencies = {
  repository: Repository;
  payloadStore: PayloadStore;
  configuration: Pick<ProviderDispatchConfigurationService, "resolve">;
  authorizeOperation(operation: ProviderOperation): Promise<boolean>;
  dispatch(input: {
    selection: ProviderDispatchSelection;
    payload: unknown;
    idempotencyKey: string;
    correlationId: string;
    signal: AbortSignal;
  }): Promise<ProviderDispatchResult>;
};
export type ProviderOperationWorkerResult = {
  recovered: number;
  claimed: number;
  succeeded: number;
  retried: number;
  needsAttention: number;
  leaseLost: number;
};

/**
 * One bounded provider-operation worker pass. Process lifecycle and cadence are
 * owned by the host; every operation remains fenced by its database lease.
 * This worker deliberately accepts an injected dispatcher so the runtime can
 * be wired to synthetic adapters only until real dispatch is explicitly approved.
 */
export class ProviderOperationWorker {
  private readonly leaseDurationSeconds: number;
  private readonly maxAttempts: number;
  private readonly retryAfterSeconds: number;
  private readonly batchSize: number;

  constructor(
    private readonly dependencies: ProviderOperationWorkerDependencies,
    private readonly options: ProviderOperationWorkerOptions,
  ) {
    for (const [label, value] of [["TENANT", options.tenantId], ["APPLICATION", options.applicationId], ["WORKER_ID", options.workerId]] as const) {
      if (typeof value !== "string" || !value.trim() || value.length > 128) throw new Error("PROVIDER_WORKER_" + label + "_INVALID");
    }
    if (!["production", "uat", "sandbox"].includes(options.auditEnvironment)) throw new Error("PROVIDER_WORKER_AUDIT_ENVIRONMENT_INVALID");
    this.leaseDurationSeconds = options.leaseDurationSeconds ?? 60;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryAfterSeconds = options.retryAfterSeconds ?? 30;
    this.batchSize = options.batchSize ?? 10;
    if (!Number.isInteger(this.leaseDurationSeconds) || this.leaseDurationSeconds < 10 || this.leaseDurationSeconds > 3600
      || !Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 20
      || !Number.isInteger(this.retryAfterSeconds) || this.retryAfterSeconds < 1 || this.retryAfterSeconds > 86400
      || !Number.isInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 100) {
      throw new Error("PROVIDER_WORKER_OPTIONS_INVALID");
    }
    if (!dependencies.repository || !dependencies.payloadStore || !dependencies.configuration
      || typeof dependencies.authorizeOperation !== "function" || typeof dependencies.dispatch !== "function") {
      throw new Error("PROVIDER_WORKER_DEPENDENCIES_INVALID");
    }
  }

  async runOnce(signal?: AbortSignal): Promise<ProviderOperationWorkerResult> {
    const context = {
      tenantId: this.options.tenantId,
      applicationId: this.options.applicationId,
      auditEnvironment: this.options.auditEnvironment,
    };
    const recovered = await this.dependencies.repository.recoverExpiredLeases({
      ...context, maxAttempts: this.maxAttempts, batchSize: this.batchSize,
    });
    const result: ProviderOperationWorkerResult = {
      recovered: recovered.length, claimed: 0, succeeded: 0, retried: 0, needsAttention: 0, leaseLost: 0,
    };
    for (let index = 0; index < this.batchSize && !signal?.aborted; index += 1) {
      const operation = await this.dependencies.repository.claimNext({
        ...context, workerId: this.options.workerId,
        leaseDurationSeconds: this.leaseDurationSeconds, maxAttempts: this.maxAttempts,
      });
      if (!operation) break;
      result.claimed += 1;
      await this.process(operation, result, signal);
    }
    return result;
  }

  private async process(operation: ProviderOperation, result: ProviderOperationWorkerResult, shutdown?: AbortSignal): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort(shutdown?.reason ?? new Error("PROVIDER_WORKER_SHUTDOWN"));
    shutdown?.addEventListener("abort", abort, { once: true });
    if (shutdown?.aborted) abort();
    let leaseLost = false;
    let renewal: Promise<void> | undefined;
    const heartbeat = setInterval(() => {
      if (renewal || leaseLost || controller.signal.aborted) return;
      renewal = this.dependencies.repository.renewLease({
        tenantId: operation.tenantId, applicationId: operation.applicationId,
        operationId: operation.operationId, workerId: this.options.workerId,
        fencingToken: operation.fencingToken, leaseDurationSeconds: this.leaseDurationSeconds,
        auditEnvironment: this.options.auditEnvironment,
      }).then(() => undefined).catch(() => {
        leaseLost = true;
        controller.abort(new Error("PROVIDER_WORKER_LEASE_LOST"));
      }).finally(() => { renewal = undefined; });
    }, Math.max(1000, Math.floor(this.leaseDurationSeconds * 1000 / 3)));
    try {
      if (controller.signal.aborted) return;
      if (!await this.dependencies.authorizeOperation(operation)) {
        await this.saveOutcome(operation, "NEEDS_ATTENTION", "PROVIDER_OPERATION_AUTHORIZATION_DENIED");
        result.needsAttention += 1;
        return;
      }
      const selection = await this.dependencies.configuration.resolve({
        tenantId: operation.tenantId, applicationId: operation.applicationId,
        capabilityKey: operation.capabilityKey,
      });
      if (selection.connectionId !== operation.connectionId || selection.capabilityKey !== operation.capabilityKey) {
        await this.saveOutcome(operation, "NEEDS_ATTENTION", "PROVIDER_OPERATION_ROUTE_MISMATCH");
        result.needsAttention += 1;
        return;
      }
      const payload = await this.dependencies.payloadStore.get({
        tenantId: operation.tenantId, applicationId: operation.applicationId,
        operationId: operation.operationId, capabilityKey: operation.capabilityKey,
        reference: operation.payloadReference, digest: operation.requestDigest,
      });
      if (controller.signal.aborted) return;
      const dispatched = await this.dependencies.dispatch({
        selection, payload, idempotencyKey: operation.idempotencyKey,
        correlationId: operation.correlationId, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (heartbeat) clearInterval(heartbeat);
      if (renewal) await renewal;
      if (leaseLost) { result.leaseLost += 1; return; }
      await this.saveOutcome(operation, "SUCCEEDED", undefined, dispatched.providerReference);
      result.succeeded += 1;
    } catch {
      if (controller.signal.aborted && leaseLost) { result.leaseLost += 1; return; }
      if (controller.signal.aborted) return;
      if (renewal) await renewal;
      if (leaseLost) { result.leaseLost += 1; return; }
      // Never persist provider exception text, request bodies, or credentials.
      await this.saveOutcome(operation, "RETRY", "PROVIDER_OPERATION_DISPATCH_FAILED");
      result.retried += 1;
    } finally {
      clearInterval(heartbeat);
      if (renewal) await renewal;
      shutdown?.removeEventListener("abort", abort);
    }
  }

  private async saveOutcome(operation: ProviderOperation, outcome: "SUCCEEDED" | "RETRY" | "NEEDS_ATTENTION", errorCode?: string, providerReference?: string): Promise<void> {
    await this.dependencies.repository.recordOutcome({
      tenantId: operation.tenantId, applicationId: operation.applicationId,
      operationId: operation.operationId, workerId: this.options.workerId,
      outcome, errorCode, providerReference, retryAfterSeconds: this.retryAfterSeconds,
      maxAttempts: this.maxAttempts, fencingToken: operation.fencingToken,
      auditEnvironment: this.options.auditEnvironment,
    });
  }
}
