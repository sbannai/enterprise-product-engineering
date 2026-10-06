import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createAppServer } from "../dist/apps/api/server.js";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function startServer() {
  const server = createAppServer();
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

test("health returns the configured commit build ID", async () => {
  const previous = process.env.EPER_BUILD_ID;
  process.env.EPER_BUILD_ID = "b654c471152dba3cde07000be26bd57028872a91";
  try {
    const response = await fetch(`${await startServer()}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "eper-api",
      buildId: "b654c471152dba3cde07000be26bd57028872a91",
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (previous === undefined) delete process.env.EPER_BUILD_ID;
    else process.env.EPER_BUILD_ID = previous;
  }
});

test("health fails closed when a commit build ID is not configured", async () => {
  const previous = process.env.EPER_BUILD_ID;
  delete process.env.EPER_BUILD_ID;
  try {
    const response = await fetch(`${await startServer()}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "unconfigured",
      service: "eper-api",
      buildId: null,
    });
  } finally {
    if (previous !== undefined) process.env.EPER_BUILD_ID = previous;
  }
});

test("unknown routes return 404 without exposing implementation details", async () => {
  const response = await fetch(`${await startServer()}/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});
