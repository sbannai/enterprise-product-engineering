import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("application-data intent worker uses leases, retry recovery and generation fencing", async () => {
  const source = await readFile(new URL("../packages/workflows/application-data-activity-intent-worker.ts", import.meta.url), "utf8");
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /intent_status = 'processing' AND locked_at </);
  assert.match(source, /claim_generation = i\.claim_generation \+ 1/);
  assert.match(source, /claim_generation = \$8/);
  assert.match(source, /locked_by = \$4/);
  assert.match(source, /idempotencyKey: intent\.idempotency_key/);
  assert.match(source, /maxAttempts/);
  assert.match(source, /power\(2, LEAST\(attempts, 8\)\)/);
});
