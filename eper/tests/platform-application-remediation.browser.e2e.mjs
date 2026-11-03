import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { chromium } from "playwright";
import { createAppServer } from "../dist/apps/api/server.js";
import { PostgresPlatformApplicationRemediationStore } from "../dist/packages/workflows/postgres-platform-application-remediation-store.js";

const { Pool } = pg;

test("Product Admin browser confirms and completes one versioned application remediation", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for browser/PostgreSQL evidence");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  const suffix = randomUUID().replaceAll("-", "");
  const tenantId = "browser-remediation-tenant-" + suffix;
  const applicationId = "browser-remediation-app-" + suffix;
  const platformActorId = "browser-platform-operator-" + suffix;
  const credentialId = "browser-platform-key-" + suffix;
  const credential = "browser-remediation-credential-" + suffix + "-long-secret";
  const correlationId = "browser-remediation-" + suffix;
  const previous = {
    enabled: process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED,
    identities: process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON,
  };
  let server;
  let browser;
  try {
    process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED = "true";
    process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON = JSON.stringify({
      [credential]: { platformActorId, credentialId, permissions: ["application:remediate"] },
    });
    const store = new PostgresPlatformApplicationRemediationStore(pool);
    await store.assertReady();
    await pool.query(
      `INSERT INTO eper_customer_account
        (tenant_id, customer_status, status_reason, effective_at, version, updated_at, updated_by)
       VALUES ($1, 'active', 'browser remediation fixture', NOW(), 1, NOW(), $2)`,
      [tenantId, platformActorId],
    );
    await pool.query(
      `INSERT INTO eper_tenant_application_assignment
        (tenant_id, application_id, assignment_status, assigned_by, updated_by)
       VALUES ($1, $2, 'active', $3, $3)`,
      [tenantId, applicationId, platformActorId],
    );
    server = createAppServer({
      platformApplicationRemediationStore: store,
      adminConfigEnvironment: "sandbox",
      serviceVersion: "browser-e2e",
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("dialog", dialog => dialog.accept());
    await page.goto("http://127.0.0.1:" + address.port + "/platform/application-remediation/ui");
    assert.match(await page.title(), /Application remediation/);
    await page.locator("#token").fill(credential);
    await page.locator("#tenant").fill(tenantId);
    await page.locator("#application").fill(applicationId);
    await page.locator("#version").fill("1");
    await page.locator("#reason").fill("INC-BROWSER-" + suffix + " — operator-confirmed application suspension");
    await page.locator("#idempotency").fill("browser-idempotency-" + suffix);
    await page.getByRole("button", { name: "Review and suspend this application" }).click();
    await page.waitForFunction(() => document.querySelector("#result")?.classList.contains("ok"));
    const confirmation = await page.locator("#result").textContent();
    assert.match(confirmation ?? "", /Server confirmed revoked/);
    assert.match(confirmation ?? "", new RegExp(applicationId));
    assert.match(confirmation ?? "", /tariff access tariff_missing/);
    const assignment = await pool.query(
      "SELECT assignment_status, version, revoked_by FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND application_id=$2",
      [tenantId, applicationId],
    );
    assert.equal(assignment.rowCount, 1);
    assert.equal(assignment.rows[0].assignment_status, "revoked");
    assert.equal(Number(assignment.rows[0].version), 2);
    assert.equal(assignment.rows[0].revoked_by, platformActorId);
    const audit = await pool.query(
      "SELECT action, actor_id, payload FROM eper_audit_events WHERE tenant_id=$1 AND application_id=$2 AND action='platform.application_assignment.remediate'",
      [tenantId, applicationId],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].actor_id, platformActorId);
    assert.equal(audit.rows[0].payload.reasonTicketReference, "INC-BROWSER-" + suffix + " — operator-confirmed application suspension");
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      await client.query(
        "DELETE FROM eper_platform_application_remediation_idempotency WHERE tenant_id=$1 AND application_id=$2",
        [tenantId, applicationId],
      );
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK").catch(() => undefined);
    } finally { client.release(); }
    await pool.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND application_id=$2", [tenantId, applicationId]).catch(() => undefined);
    await pool.query("DELETE FROM eper_customer_account WHERE tenant_id=$1", [tenantId]).catch(() => undefined);
    await pool.end();
    if (previous.enabled === undefined) delete process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED;
    else process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED = previous.enabled;
    if (previous.identities === undefined) delete process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON;
    else process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON = previous.identities;
  }
});
