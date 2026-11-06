import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

async function withServer(run) {
  const previous = {
    enabled: process.env.EPER_UAT_API_ENABLED,
    build: process.env.EPER_BUILD_ID,
    renderCommit: process.env.RENDER_GIT_COMMIT,
  };
  delete process.env.EPER_UAT_API_ENABLED;
  delete process.env.RENDER_GIT_COMMIT;
  process.env.EPER_BUILD_ID = "8825c0f8b9cf8a523e2943dbf2ce0a5a2d74b959";
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previous.enabled === undefined) delete process.env.EPER_UAT_API_ENABLED;
    else process.env.EPER_UAT_API_ENABLED = previous.enabled;
    if (previous.build === undefined) delete process.env.EPER_BUILD_ID;
    else process.env.EPER_BUILD_ID = previous.build;
    if (previous.renderCommit === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = previous.renderCommit;
  }
}

test("health returns the configured commit identity without enabling business execution", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "eper-api");
    assert.equal(body.buildId, "8825c0f8b9cf8a523e2943dbf2ce0a5a2d74b959");
  });
});

test("hosted UAT execution stays disabled when EPER_UAT_API_ENABLED is absent", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/uat/requirements/REQ-46301/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { operation: "test" } }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  });
});
