import type { Pool } from "pg";

export async function assertRestrictedWorkerDatabaseRole(pool: Pool, expectedRole: string): Promise<void> {
  const client = await pool.connect();
  try {
    const identity = await client.query<{
      role_name: string;
      can_login: boolean;
      is_superuser: boolean;
      can_create_database: boolean;
      can_create_role: boolean;
      can_replicate: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT current_user::text AS role_name,
             r.rolcanlogin AS can_login,
             r.rolsuper AS is_superuser,
             r.rolcreatedb AS can_create_database,
             r.rolcreaterole AS can_create_role,
             r.rolreplication AS can_replicate,
             r.rolbypassrls AS bypasses_rls
        FROM pg_roles r
       WHERE r.rolname = current_user
    `);
    const role = identity.rows[0];
    if (!role || role.role_name !== expectedRole) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_MISMATCH");
    }
    if (!role.can_login) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_LOGIN_REQUIRED");
    }
    if (role.is_superuser || role.can_create_database || role.can_create_role ||
        role.can_replicate || role.bypasses_rls) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_PRIVILEGED");
    }

    const schema = await client.query<{
      assignments_table: string | null;
      events_table: string | null;
      delivery_table: string | null;
      events_rls: boolean | null;
      delivery_rls: boolean | null;
      events_force_rls: boolean | null;
      delivery_force_rls: boolean | null;
      events_owner: string | null;
      delivery_owner: string | null;
    }>(`
      SELECT to_regclass('public.eper_tenant_application_assignment')::text AS assignments_table,
             to_regclass('public.eper_workflow_outbox_events')::text AS events_table,
             to_regclass('public.eper_workflow_outbox_delivery')::text AS delivery_table,
             (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_events')) AS events_rls,
             (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_delivery')) AS delivery_rls,
             (SELECT relforcerowsecurity FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_events')) AS events_force_rls,
             (SELECT relforcerowsecurity FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_delivery')) AS delivery_force_rls,
             (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_events')) AS events_owner,
             (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_delivery')) AS delivery_owner
    `);
    const tables = schema.rows[0];
    if (!tables?.assignments_table || !tables.events_table || !tables.delivery_table) {
      throw new Error("WORKFLOW_OUTBOX_SCHEMA_NOT_READY");
    }
    if (tables.events_rls !== true || tables.delivery_rls !== true ||
        tables.events_force_rls !== true || tables.delivery_force_rls !== true ||
        tables.events_owner === expectedRole || tables.delivery_owner === expectedRole) {
      throw new Error("WORKFLOW_OUTBOX_RLS_BOUNDARY_INVALID");
    }

    const privileges = await client.query<{
      read_assignment_scope_columns: boolean;
      read_assignment_table: boolean;
      read_assignment_metadata: boolean;
      read_events: boolean;
      read_delivery: boolean;
      update_delivery_table: boolean;
      update_delivery_columns: boolean;
      write_assignments: boolean;
      write_events: boolean;
      insert_delivery: boolean;
      delete_delivery: boolean;
      truncate_assignments: boolean;
      truncate_events: boolean;
      truncate_delivery: boolean;
    }>(`
      SELECT
        (
          has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'tenant_id', 'SELECT')
          AND has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'application_id', 'SELECT')
          AND has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'assignment_status', 'SELECT')
        ) AS read_assignment_scope_columns,
        has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'SELECT') AS read_assignment_table,
        (
          has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'version', 'SELECT')
          OR has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'assigned_at', 'SELECT')
          OR has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'assigned_by', 'SELECT')
          OR has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'revoked_at', 'SELECT')
          OR has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'revoked_by', 'SELECT')
          OR has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'updated_at', 'SELECT')
          OR has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'updated_by', 'SELECT')
        ) AS read_assignment_metadata,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'SELECT') AS read_events,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'SELECT') AS read_delivery,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'UPDATE') AS update_delivery_table,
        (
          has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'delivery_status', 'UPDATE')
          AND has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'attempts', 'UPDATE')
          AND has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'available_at', 'UPDATE')
          AND has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'locked_at', 'UPDATE')
          AND has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'locked_by', 'UPDATE')
          AND has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'last_error', 'UPDATE')
          AND has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'delivered_at', 'UPDATE')
          AND has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'updated_at', 'UPDATE')
        ) AS update_delivery_columns,
        (has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'INSERT')
          OR has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'UPDATE')
          OR has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'DELETE')) AS write_assignments,
        (has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'INSERT')
          OR has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'UPDATE')
          OR has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'DELETE')) AS write_events,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'INSERT') AS insert_delivery,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'DELETE') AS delete_delivery,
        has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'TRUNCATE') AS truncate_assignments,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'TRUNCATE') AS truncate_events,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'TRUNCATE') AS truncate_delivery
    `);
    const grants = privileges.rows[0];
    if (!grants || !grants.read_assignment_scope_columns || grants.read_assignment_table ||
        grants.read_assignment_metadata || !grants.read_events || !grants.read_delivery ||
        !grants.update_delivery_columns || grants.update_delivery_table ||
        grants.write_assignments || grants.write_events ||
        grants.insert_delivery || grants.delete_delivery ||
        grants.truncate_assignments || grants.truncate_events || grants.truncate_delivery) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_GRANTS_INVALID");
    }

    const inheritedPrivilege = await client.query<{ elevated_membership: boolean; owner_membership: boolean }>(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_roles r
           WHERE (r.rolsuper OR r.rolbypassrls)
             AND pg_has_role(current_user, r.rolname, 'MEMBER')
        ) AS elevated_membership,
        EXISTS (
          SELECT 1 FROM pg_class c
           WHERE c.oid IN (
             to_regclass('public.eper_workflow_outbox_events'),
             to_regclass('public.eper_workflow_outbox_delivery')
           )
             AND pg_has_role(current_user, pg_get_userbyid(c.relowner), 'MEMBER')
        ) AS owner_membership
    `);
    if (inheritedPrivilege.rows[0]?.elevated_membership || inheritedPrivilege.rows[0]?.owner_membership) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_INHERITS_PRIVILEGE");
    }
  } finally {
    client.release();
  }
}
