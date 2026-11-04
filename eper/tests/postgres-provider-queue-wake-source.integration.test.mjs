import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

test("PostgreSQL delivers NOTIFY only after the publishing transaction commits", {
  skip: !connectionString,
}, async () => {
  const listener = new Client({ connectionString });
  const writer = new Client({ connectionString });
  const channel = "eper_test_wake_" + randomUUID().replaceAll("-", "");
  let resolveNotification;
  const notification = new Promise((resolve) => { resolveNotification = resolve; });
  listener.on("notification", (message) => {
    if (message.channel === channel) resolveNotification(message);
  });

  await listener.connect();
  await writer.connect();
  try {
    await listener.query("LISTEN " + channel);
    await writer.query("BEGIN");
    await writer.query("SELECT pg_notify($1, $2)", [channel, "wake"]);
    const early = await Promise.race([
      notification.then(() => "notified"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
    ]);
    assert.equal(early, "timeout");
    await writer.query("COMMIT");
    const delivered = await Promise.race([
      notification.then(() => "notified"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 2_000)),
    ]);
    assert.equal(delivered, "notified");
  } finally {
    try { await writer.query("ROLLBACK"); } catch { /* transaction may already be committed */ }
    await writer.end();
    await listener.end();
  }
});
