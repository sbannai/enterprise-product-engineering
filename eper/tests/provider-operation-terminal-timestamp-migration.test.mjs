import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../packages/audit/migrations/059_provider_operation_terminal_timestamp.sql", import.meta.url),
  "utf8",
);

test("provider operation terminal timestamp is additive and nullable", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS terminal_at TIMESTAMPTZ/);
  assert.doesNotMatch(migration, /terminal_at\s+TIMESTAMPTZ\s+NOT NULL/i);
  assert.doesNotMatch(migration, /terminal_at\s+TIMESTAMPTZ\s+DEFAULT/i);
  assert.doesNotMatch(migration, /UPDATE\s+eper_provider_operations/i);
});

test("terminal timestamp trigger captures first terminal transition and preserves evidence", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION eper_capture_provider_operation_terminal_at/);
  assert.match(migration, /OLD\.terminal_at IS NOT NULL/);
  assert.match(migration, /NEW\.terminal_at := OLD\.terminal_at/);
  assert.match(migration, /OLD\.operation_status NOT IN \('SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED'\)/);
  assert.match(migration, /NEW\.operation_status IN \('SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION', 'CANCELLED'\)/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF operation_status, terminal_at/);
  assert.match(migration, /EXECUTE FUNCTION eper_capture_provider_operation_terminal_at/);
});
