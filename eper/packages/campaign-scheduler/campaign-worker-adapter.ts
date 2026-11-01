import type { CampaignDispatcher, CampaignWorkerOptions } from "./campaign-execution-worker.js";
import type { PostgresPoolHandle } from "../payments/postgres-payment-runtime.js";

export interface CampaignWorkerAdapterContext {
  pool: PostgresPoolHandle;
  env: NodeJS.ProcessEnv;
}

/**
 * Deployment-owned adapter. It must re-check live tenant/application scope,
 * approval, consent, quiet hours and channel policy before allowing dispatch.
 * Provider calls must forward execution.idempotencyKey.
 */
export interface CampaignWorkerAdapter {
  authorizeDispatch: CampaignWorkerOptions["authorizeDispatch"];
  dispatch: CampaignDispatcher;
}

export type CampaignWorkerAdapterFactory = (
  context: CampaignWorkerAdapterContext,
) => Promise<CampaignWorkerAdapter> | CampaignWorkerAdapter;
