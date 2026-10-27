import type { CampaignExecutionRecord, PostgresCampaignSchedulerStore } from "./postgres-campaign-scheduler-store.js";

export interface CampaignDispatchResult { outcome: Record<string, unknown>; }
export type CampaignDispatcher = (execution: CampaignExecutionRecord) => Promise<CampaignDispatchResult>;
export interface CampaignWorkerOptions {
  workerId: string;
  batchSize?: number;
  idleDelayMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  /** Must reload current schedule/approval/consent/channel policy immediately before dispatch. */
  authorizeDispatch: (execution: CampaignExecutionRecord) => Promise<boolean>;
  onError?: (error: unknown) => void;
}
const sleep = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (signal?.aborted) return resolve();
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", finish);
    resolve();
  };
  const timer = setTimeout(finish, milliseconds);
  signal?.addEventListener("abort", finish, { once: true });
});

/**
 * Provider-neutral async worker loop. Dispatchers must use execution.idempotencyKey
 * for downstream side effects; a DB lease cannot guarantee exactly-once external delivery.
 */
export async function runCampaignExecutionWorker(
  store: PostgresCampaignSchedulerStore,
  dispatch: CampaignDispatcher,
  options: CampaignWorkerOptions,
): Promise<void> {
  if (!options.workerId?.trim()) throw new Error("CAMPAIGN_WORKER_ID_REQUIRED");
  const batchSize = options.batchSize ?? 10;
  const idleDelayMs = options.idleDelayMs ?? 1000;
  const maxAttempts = options.maxAttempts ?? 5;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("CAMPAIGN_CLAIM_LIMIT_INVALID");
  if (!Number.isInteger(idleDelayMs) || idleDelayMs < 100 || idleDelayMs > 60000) throw new Error("CAMPAIGN_WORKER_IDLE_DELAY_INVALID");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new Error("CAMPAIGN_RETRY_POLICY_INVALID");

  while (!options.signal?.aborted) {
    let executions: CampaignExecutionRecord[];
    try {
      await store.recoverStaleExecutions();
      await store.materializeDueOneTimeSchedules();
      await store.materializeDueRecurringSchedules();
      executions = await store.claimExecutions(options.workerId, batchSize);
    } catch (error) {
      options.onError?.(error);
      await sleep(idleDelayMs, options.signal);
      continue;
    }
    if (!executions.length) {
      await sleep(idleDelayMs, options.signal);
      continue;
    }

    await Promise.all(executions.map(async (execution) => {
      if (options.signal?.aborted) return;
      try {
        // Fail closed: never call the provider unless current policy authorizes this execution.
        // The implementation must re-read authoritative state; do not authorize from the claimed row alone.
        let authorized = false;
        try {
          // Check the worker lease and current schedule approval/status first, then allow
          // the injected policy callback to add consent, quiet-hours and channel checks.
          authorized = await store.isExecutionAuthorizedForDispatch({
            tenantId: execution.tenantId,
            applicationId: execution.applicationId,
            executionId: execution.id,
            workerId: options.workerId,
          });
          if (authorized) authorized = await options.authorizeDispatch(execution);
        } catch (authorizationError) {
          // A policy service outage is not permission to dispatch. Fail closed and do not retry
          // this execution automatically; an operator can review and explicitly requeue it.
          options.onError?.(authorizationError);
        }
        if (!authorized) {
          await store.failExecution({
            tenantId: execution.tenantId, applicationId: execution.applicationId,
            executionId: execution.id, workerId: options.workerId,
            errorCode: "CAMPAIGN_DISPATCH_POLICY_DENIED", maxAttempts: 1,
          });
          return;
        }
        const dispatched = await dispatch(execution);
        await store.completeExecution({
          tenantId: execution.tenantId, applicationId: execution.applicationId,
          executionId: execution.id, workerId: options.workerId, result: dispatched.outcome,
        });
      } catch (error) {
        options.onError?.(error);
        const code = error instanceof Error && error.name !== "Error" ? error.name : "CAMPAIGN_DISPATCH_FAILED";
        await store.failExecution({
          tenantId: execution.tenantId, applicationId: execution.applicationId,
          executionId: execution.id, workerId: options.workerId, errorCode: code, maxAttempts,
        }).catch(options.onError);
      }
    }));
  }
}
