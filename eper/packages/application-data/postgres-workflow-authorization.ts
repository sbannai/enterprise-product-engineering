import type { PoolClient } from "pg";
import type { ApplicationDataContext } from "./contracts.js";

/** Lock and revalidate the exact workflow grant inside the same transaction as the record operation. */
export async function assertApplicationDataWorkflowAuthorization(
  client: PoolClient, context: ApplicationDataContext,
): Promise<void> {
  if (!context.workflowRoleId || !context.workflowPermission) {
    throw new Error("APPLICATION_DATA_WORKFLOW_AUTHORIZATION_CONTEXT_MISSING");
  }
  const authorized = await client.query<{ role_id: string }>(`
    SELECT r.role_id
      FROM eper_workflow_actor_role_assignment r
      JOIN eper_actor_application_assignment aa
        ON aa.tenant_id = r.tenant_id AND aa.application_id = r.application_id
       AND aa.actor_id = r.actor_id AND aa.assignment_status = 'active'
      JOIN eper_tenant_application_assignment ta
        ON ta.tenant_id = r.tenant_id AND ta.application_id = r.application_id
       AND ta.assignment_status = 'active'
      JOIN eper_workflow_role_definition rd
        ON rd.tenant_id = r.tenant_id AND rd.application_id = r.application_id
       AND rd.role_id = r.role_id AND rd.role_status = 'active'
     WHERE r.tenant_id = $1 AND r.application_id = $2 AND r.actor_id = $3
       AND r.role_id = $4 AND r.assignment_status = 'active'
       AND (rd.permissions ? $5 OR
         ($5 = 'workflow:act' AND rd.permissions ? 'workflow:admin'))
     LIMIT 1
     FOR SHARE OF r, aa, ta, rd
  `, [context.tenantId, context.applicationId, context.actorId,
    context.workflowRoleId, context.workflowPermission]);
  if (!authorized.rows[0]) throw new Error("APPLICATION_DATA_WORKFLOW_PERMISSION_REVOKED");
}
