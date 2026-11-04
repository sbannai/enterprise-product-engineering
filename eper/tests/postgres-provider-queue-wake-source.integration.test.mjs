import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { PostgresProviderQueueWakeSource, PROVIDER_OPERATION_WAKE_CHANNEL } from "../dist/packages/integrations/postgres-provider-queue-wake-source.js";

const connectionString = process.env.DATABASE_URL;

test("provider queue notification is delivered only after the enqueue transaction commits", {
  skip: !connectionString,
}, async () => {
  const listener = new Client({ connectionString });
  const writer = new Client({ connectionString });
  const source = new PostgresProviderQueueWakeSource(() => listener);
  await source.start();
  await writer.connect();
  try {
    await writer.query("BEGIN");
    await writer.query("SELECT pg_notify($1, $2)", [PROVIDER_OPERATION_WAKE_CHANNEL, "wake"]);
    assert.equal(await source.wait(25, new AbortController().signal), "timeout");
    await writer.query("COMMIT");
    assert.equal(await source.wait(2_000, new AbortController().signal), "notified");
  } finally {
    try { await writer.query("ROLLBACK"); } catch { /* transaction may already be committed */ }
    await writer.end();
    await source.close();
  }
});
