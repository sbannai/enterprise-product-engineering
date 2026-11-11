import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const connectionString = process.env.EPER_WORKFLOW_OUTBOX_TEST_DATABASE_URL;
const groupRole = "eper_workflow_outbox_worker_access";

test("dedicated workflow outbox login has only the approved database privileges",
  { skip: !connectionString }, async () => {
    const pool = new pg.Pool({ connectionString, max: 1 });
    try {
      const client = await pool.connect();
      try {
        const identity = await client.query(`
          SELECT current_user AS role_name, r.rolcanlogin, r.rolsuper, r.rolbypassrls,
                 pg_has_role(current_user, $1, 'MEMBER') AS is_member
            FROM pg_roles r
           WHERE r.rolname = current_user
        `, [groupRole]);
        assert.equal(identity.rowCount, 1);
        assert.equal(identity.rows[0].rolcanlogin, true);
        assert.equal(identity.rows[0].rolsuper, false);
        assert.equal(identity.rows[0].rolbypassrls, false);
        assert.equal(identity.rows[0].is_member, true);

        const assignment = await client.query(`
          SELECT
            has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'SELECT') AS table_select,
            has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'tenant_id', 'SELECT') AS tenant_id,
            has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'application_id', 'SELECT') AS application_id,
            has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'assignment_status', 'SELECT') AS assignment_status,
            has_column_privilege(current_user, 'public.eper_tenant_application_assignment', 'version', 'SELECT') AS version,
            has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'INSERT') AS insert_rows,
            has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'UPDATE') AS update_rows,
            has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'DELETE') AS delete_rows,
            has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'TRUNCATE') AS truncate_rows
        `);
        assert.deepEqual(assignment.rows[0], {
          table_select: false, tenant_id: true, application_id: true, assignment_status: true,
          version: false, insert_rows: false, update_rows: false, delete_rows: false, truncate_rows: false,
        });

        const outbox = await client.query(`
          SELECT
            has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'SELECT') AS read_events,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'INSERT') AS write_events,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'UPDATE') AS update_events,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'DELETE') AS delete_events,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'TRUNCATE') AS truncate_events,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'SELECT') AS read_delivery,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'UPDATE') AS update_delivery_table,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'INSERT') AS insert_delivery,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'DELETE') AS delete_delivery,
            has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'TRUNCATE') AS truncate_delivery,
            has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'delivery_status', 'UPDATE') AS delivery_status,
            has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'attempts', 'UPDATE') AS attempts,
            has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'last_error', 'UPDATE') AS last_error,
            has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'event_id', 'UPDATE') AS event_id,
            has_column_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'claim_generation', 'UPDATE') AS claim_generation
        `);
        assert.deepEqual(outbox.rows[0], {
          read_events: true, write_events: false, update_events: false, delete_events: false,
          truncate_events: false, read_delivery: true, update_delivery_table: false,
          insert_delivery: false, delete_delivery: false, truncate_delivery: false,
          delivery_status: true, attempts: true, last_error: true, event_id: false, claim_generation: true,
        });

        const boundaries = await client.query(`
          SELECT
            (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.eper_workflow_outbox_events'::regclass) AS events_rls,
            (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.eper_workflow_outbox_events'::regclass) AS events_force_rls,
            (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.eper_workflow_outbox_delivery'::regclass) AS delivery_rls,
            (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.eper_workflow_outbox_delivery'::regclass) AS delivery_force_rls,
            EXISTS (
              SELECT 1 FROM pg_roles r
               WHERE (r.rolsuper OR r.rolbypassrls)
                 AND pg_has_role(current_user, r.rolname, 'MEMBER')
            ) AS elevated_membership,
            EXISTS (
              SELECT 1 FROM pg_class c
               WHERE c.oid IN (
                 'public.eper_workflow_outbox_events'::regclass,
                 'public.eper_workflow_outbox_delivery'::regclass
               )
                 AND pg_has_role(current_user, pg_get_userbyid(c.relowner), 'MEMBER')
            ) AS owner_membership
        `);
        assert.deepEqual(boundaries.rows[0], {
          events_rls: true, events_force_rls: true, delivery_rls: true,
          delivery_force_rls: true, elevated_membership: false, owner_membership: false,
        });
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });
