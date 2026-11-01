#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim()
  || "postgres://eper:eper_local_only_password@127.0.0.1:5432/eper_test_local";

let parsed;
try { parsed = new URL(databaseUrl); } catch {
  console.error("EPER_LOCAL_DATABASE_URL_INVALID");
  process.exit(1);
}
const databaseName = parsed.pathname.replace(/^\//, "");
const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
if (!loopback || !/(local|dev|test|sandbox)/i.test(databaseName)) {
  console.error("EPER_DEV_VERIFY_REFUSES_NON_LOCAL_DATABASE");
  console.error("Use a loopback PostgreSQL host and a database name containing local, dev, test, or sandbox.");
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  EPER_PAYMENT_DATABASE_URL: databaseUrl,
  EPER_AUDIT_DATABASE_URL: databaseUrl,
  EPER_WORKFLOW_DATABASE_URL: databaseUrl,
  EPER_TICKETING_DATABASE_URL: databaseUrl,
  EPER_CAMPAIGN_SCHEDULER_DATABASE_URL: databaseUrl,
  EPER_CAMPAIGN_SCHEDULER_TEST_DATABASE_URL: databaseUrl,
};

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
try {
  const result = await pool.query("SELECT current_database() AS database_name, current_user AS database_user");
  if (result.rows[0]?.database_name !== databaseName) throw new Error("EPER_LOCAL_DATABASE_IDENTITY_MISMATCH");
  console.log(`Connected to local PostgreSQL database '${databaseName}' as '${result.rows[0].database_user}'.`);
} catch (error) {
  console.error("EPER_LOCAL_POSTGRES_CONNECTION_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
if (process.exitCode) process.exit(process.exitCode);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(label, args, extraEnv = env) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(npm, args, {
    cwd: process.cwd(),
    env: extraEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
    process.exit(result.status ?? 1);
  }
}

run("Typecheck", ["run", "typecheck"]);
run("Build", ["run", "build"]);
for (const migration of [
  "migrate:payments",
  "migrate:audit",
  "migrate:workflows",
  "migrate:campaign-scheduler",
  "migrate:capabilities",
  "migrate:ticketing",
]) run(`PostgreSQL migration: ${migration}`, ["run", migration]);

run("Repeatability check: workflow migrations", ["run", "migrate:workflows"]);
run("Repeatability check: ticketing migrations", ["run", "migrate:ticketing"]);
run("Repeatability check: capability migrations", ["run", "migrate:capabilities"]);

const testEnv = {
  ...env,
  EPER_IDENTITY_ASSIGNMENT_LIVE_TESTS: "1",
  EPER_CAPABILITY_LIVE_TESTS: "1",
};
run("Full EPER test suite with live PostgreSQL integration enabled", ["test"], testEnv);
console.log("\nEPER_LOCAL_DEVELOPER_VERIFICATION=PASS");
