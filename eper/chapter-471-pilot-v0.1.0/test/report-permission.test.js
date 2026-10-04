import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/app.js";

test("Chapter 471 report denies an authenticated caller without report permission", async () => {
  const server = createServer({
    resolveContext: () => ({
      authenticated: true,
      principalId: "report-denied-user",
      tenantId: "tenant-a",
      permissions: [],
    }),
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/report`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "forbidden" });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
