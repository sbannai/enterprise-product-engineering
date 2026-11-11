import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = resolve(root, "packages/audit/migrations");

test("DISCONNECTING is an allowed lifecycle status", async () => {
  const sql = await readFile(resolve(migrations, "037_peripheral_disconnect_in_progress.sql"), "utf8");
  assert.match(sql, /'DISCONNECTING'/);
  assert.match(sql, /eper_application_peripheral_lifecycle_status_check/);
});

test("DISCONNECTING requires its configured adapter and active configuration", async () => {
  const sql = await readFile(resolve(migrations, "038_peripheral_disconnecting_configuration_guard.sql"), "utf8");
  assert.match(sql, /lifecycle_status <> 'DISCONNECTING'/);
  assert.match(sql, /adapter_key IS NOT NULL/);
  assert.match(sql, /adapter_version IS NOT NULL/);
  assert.match(sql, /active_configuration_version IS NOT NULL/);
});
