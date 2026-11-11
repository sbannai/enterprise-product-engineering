import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { chromium } from "playwright";
import { createAppServer } from "../dist/apps/api/server.js";
import { PostgresTenantApplicationAssignmentStore } from "../dist/packages/identity/postgres-tenant-application-assignment-store.js";
import { PostgresActorApplicationAssignmentStore } from "../dist/packages/identity/postgres-actor-application-assignment-store.js";
import { PostgresWorkflowRoleDefinitionStore } from "../dist/packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../dist/packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { PostgresWorkflowDefinitionDraftStore } from "../dist/packages/workflows/postgres-workflow-definition-draft-store.js";
import { WorkflowDefinitionPublisher } from "../dist/packages/workflows/workflow-definition-publisher.js";
import { PostgresWorkflowExecutionService } from "../dist/packages/workflows/postgres-workflow-execution-service.js";

const { Pool } = pg;

test("Customer Admin workflow studio isolates same-ID drafts across applications and rejects stale browser saves", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for browser/PostgreSQL evidence");
  const suffix = randomUUID().replaceAll("-", "");
  const tenantId = "wf-studio-tenant-" + suffix;
  const actorId = "wf-studio-admin-" + suffix;
  const applicationA = "wf-studio-a-" + suffix;
  const applicationB = "wf-studio-b-" + suffix;
  const workflowId = "expense-approval";
  const credential = "wf-studio-browser-credential-" + suffix + "-long-secret";
  const correlationId = "wf-studio-browser-" + suffix;
  const envKeys = ["EPER_WORKFLOW_EXECUTION_API_ENABLED","EPER_ADMIN_CONFIG_API_ENABLED","EPER_ADMIN_CONFIG_PERSISTENCE","EPER_ADMIN_CONFIG_IDENTITIES_JSON","EPER_AUDIT_PERSISTENCE"];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const tenantAssignments = new PostgresTenantApplicationAssignmentStore(pool);
  const actorAssignments = new PostgresActorApplicationAssignmentStore(pool);
  const roleStore = new PostgresWorkflowRoleDefinitionStore(pool);
  const actorRoleStore = new PostgresWorkflowActorRoleAssignmentStore(pool);
  const draftStore = new PostgresWorkflowDefinitionDraftStore(pool);
  const publisher = new WorkflowDefinitionPublisher(pool);
  const executionService = new PostgresWorkflowExecutionService(pool, "workflow-studio-browser-e2e");
  let server;
  let browser;

  try {
    Object.assign(process.env, {
      EPER_WORKFLOW_EXECUTION_API_ENABLED: "true",
      EPER_ADMIN_CONFIG_API_ENABLED: "true",
      EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
      EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({ [credential]: { tenantId, actorId, roleKey: "customer_admin" } }),
      EPER_AUDIT_PERSISTENCE: "postgres",
    });
    await Promise.all([tenantAssignments.assertReady(),actorAssignments.assertReady(),roleStore.assertReady(),actorRoleStore.assertReady(),draftStore.assertReady()]);

    for (const applicationId of [applicationA, applicationB]) {
      await pool.query(
        "INSERT INTO eper_tenant_application_assignment (tenant_id,application_id,assignment_status,assigned_by,updated_by) VALUES ($1,$2,'active',$3,$3)",
        [tenantId, applicationId, actorId],
      );
      await pool.query(
        "INSERT INTO eper_actor_application_assignment (tenant_id,actor_id,application_id,assignment_status,version,assigned_by,updated_by) VALUES ($1,$2,$3,'active',1,$2,$2)",
        [tenantId, actorId, applicationId],
      );
      await roleStore.replace({
        tenantId, applicationId, roleId: "requester", name: "Requester",
        description: "Browser test workflow role", permissions: ["workflow:act", "role:assign"],
        delegable: false, status: "active", expectedVersion: 0, changedBy: actorId,
        environment: "sandbox", correlationId: correlationId + "-" + applicationId,
        serviceVersion: "workflow-studio-browser-e2e",
      });
      await actorRoleStore.assign({
        tenantId, applicationId, actorId, roleId: "requester",
        changedBy: actorId, expectedVersion: 0, environment: "sandbox",
        correlationId: correlationId + "-role-assignment-" + applicationId,
        serviceVersion: "workflow-studio-browser-e2e",
      });
    }

    server = createAppServer({
      tenantApplicationAssignmentStore: tenantAssignments,
      actorApplicationAssignmentStore: actorAssignments,
      workflowRoleDefinitionStore: roleStore,
      workflowActorRoleAssignmentStore: actorRoleStore,
      workflowDefinitionDraftStore: draftStore,
      workflowDefinitionPublisher: publisher,
      workflowExecutionService: executionService,
      adminConfigEnvironment: "sandbox",
      serviceVersion: "workflow-studio-browser-e2e",
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const ownerPage = await context.newPage();
    const stalePage = await context.newPage();
    const pageErrors = [];
    for (const page of [ownerPage, stalePage]) page.on("pageerror", error => pageErrors.push(error.message));
    const origin = "http://127.0.0.1:" + address.port;

    async function connect(page, applicationId) {
      await page.goto(origin + "/customer/workflow-studio");
      await page.locator("#applicationId").fill(applicationId);
      await page.locator("#adminToken").fill(credential);
      await page.getByRole("button", { name: "Connect & load" }).click();
      await page.waitForFunction(id => document.querySelector("#connectionStatus")?.textContent.includes("Application " + id + " loaded."), applicationId);
    }
    async function createDraft(page, description) {
      await page.getByRole("button", { name: "+ New" }).click();
      await page.locator("#wfId").fill(workflowId);
      await page.locator("#wfName").fill("Expense approval");
      await page.locator("#wfDescription").fill(description);
      await page.getByRole("button", { name: "+ Activity" }).click();
      await page.locator('#activities input[data-a="0"][data-k="id"]').fill("submit");
      await page.locator('#activities input[data-a="0"][data-k="title"]').fill("Submit expense");
      await page.locator('#activities select[data-a="0"][data-k="roleId"]').selectOption("requester");
      await page.getByRole("button", { name: "Save draft" }).click();
      await page.waitForFunction(() => document.querySelector("#connectionStatus")?.textContent.includes("Draft saved for application"));
    }

    await connect(ownerPage, applicationA);
    await createDraft(ownerPage, "Application A private draft");
    await connect(ownerPage, applicationB);
    await createDraft(ownerPage, "Application B private draft");

    await connect(stalePage, applicationB);
    await stalePage.locator('[data-workflow="' + workflowId + '"]').click();
    assert.equal(await stalePage.locator("#wfDescription").inputValue(), "Application B private draft");

    await ownerPage.locator("#wfDescription").fill("Application B winning revision");
    await ownerPage.getByRole("button", { name: "Save draft" }).click();
    await ownerPage.waitForFunction(() => document.querySelector("#connectionStatus")?.textContent.includes("Draft saved for application"));

    await stalePage.locator("#wfDescription").fill("Stale editor must not overwrite");
    await stalePage.getByRole("button", { name: "Save draft" }).click();
    await stalePage.waitForFunction(() => /VERSION_CONFLICT/.test(document.querySelector("#connectionStatus")?.textContent || ""));
    await stalePage.getByRole("button", { name: "Refresh" }).click();
    await stalePage.waitForFunction(() => document.querySelector("#connectionStatus")?.textContent.includes("loaded."));
    assert.equal(await stalePage.locator("#wfDescription").inputValue(), "Application B winning revision");

    await connect(ownerPage, applicationA);
    assert.equal(await ownerPage.locator("#wfDescription").inputValue(), "Application A private draft");
    await connect(ownerPage, applicationB);
    assert.equal(await ownerPage.locator("#wfDescription").inputValue(), "Application B winning revision");

    const rows = await pool.query(
      "SELECT application_id,draft_version,definition->>'description' AS description FROM eper_workflow_definition_drafts WHERE tenant_id=$1 AND workflow_id=$2 ORDER BY application_id",
      [tenantId, workflowId],
    );
    assert.equal(rows.rowCount, 2);
    const byApplication = new Map(rows.rows.map(row => [row.application_id, row]));
    assert.equal(Number(byApplication.get(applicationA)?.draft_version), 1);
    assert.equal(byApplication.get(applicationA)?.description, "Application A private draft");
    assert.equal(Number(byApplication.get(applicationB)?.draft_version), 2);
    assert.equal(byApplication.get(applicationB)?.description, "Application B winning revision");
    assert.deepEqual(pageErrors, [], "Customer Admin workflow studio must not raise browser runtime errors");
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await pool.query("DELETE FROM eper_workflow_definition_drafts WHERE tenant_id=$1", [tenantId]);
      // Remove dependent role memberships before their role definitions and actor assignments.
      await pool.query("DELETE FROM eper_workflow_actor_role_assignment WHERE tenant_id=$1", [tenantId]);
      await pool.query("DELETE FROM eper_workflow_role_definition WHERE tenant_id=$1", [tenantId]);
      await pool.query("DELETE FROM eper_actor_application_assignment WHERE tenant_id=$1", [tenantId]);
      await pool.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1", [tenantId]);
    } finally {
      await pool.end();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
});
