import type { Pool } from "pg";
import { ApplicationDataService } from "../../../packages/application-data/service.js";
import { PostgresApplicationDataAdapter } from "../../../packages/application-data/postgres-adapter.js";
import { ApplicationDataWorkflowActivity } from "../../../packages/application-data/workflow-binding.js";

/**
 * Built-in PostgreSQL activity factory. The adapter performs live role/permission
 * validation under row locks in the same transaction as every scoped data access.
 */
export function createApplicationDataWorkflowActivity(input: {
  pool: Pool;
  env: NodeJS.ProcessEnv;
}): ApplicationDataWorkflowActivity {
  const service = new ApplicationDataService(
    new PostgresApplicationDataAdapter(input.pool, true),
  );
  return new ApplicationDataWorkflowActivity(service, async (context) => {
    // The activity wrapper rejects incomplete provenance; the adapter rechecks
    // the active grant transactionally, avoiding a check/use race.
    if (!context.workflowRoleId || !context.workflowPermission) {
      throw new Error("APPLICATION_DATA_WORKFLOW_AUTHORIZATION_CONTEXT_MISSING");
    }
  });
}
