import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../dist/apps/api/server.js";

async function withServer(server, action) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  try { return await action(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("API runtime opts into JSON persistence and retains authoritative records across server recreation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-runtime-persistence-"));
  const previous = {
    persistence: process.env.EPER_CAPABILITY_PERSISTENCE,
    dataDirectory: process.env.EPER_CAPABILITY_DATA_DIRECTORY,
    enabled: process.env.EPER_UAT_API_ENABLED,
    token: process.env.EPER_UAT_API_TOKEN,
    tenant: process.env.EPER_UAT_TENANT_ID,
    principal: process.env.EPER_UAT_PRINCIPAL_ID,
    acknowledgement: process.env.EPER_UAT_PUBLIC_ENDPOINT_ACK,
    buildId: process.env.EPER_BUILD_ID,
  };
  Object.assign(process.env, {
    EPER_CAPABILITY_PERSISTENCE: "json-file",
    EPER_CAPABILITY_DATA_DIRECTORY: directory,
    EPER_UAT_API_ENABLED: "true",
    EPER_UAT_API_TOKEN: "test-token-that-is-at-least-32-characters",
    EPER_UAT_TENANT_ID: "runtime-persistence-tenant",
    EPER_UAT_PRINCIPAL_ID: "runtime-persistence-user",
    EPER_UAT_PUBLIC_ENDPOINT_ACK: "I_ACCEPT_PUBLIC_BEARER_UAT_RISK",
    EPER_BUILD_ID: "92dabf1d9d9f24b3a8e9f320143de7ca2449bcc2",
  });
  const request = async (base, operation) => {
    const response = await fetch(`${base}/uat/requirements/REQ-46301/execute`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.EPER_UAT_API_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ payload: operation }),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const server1 = createAppServer();
    const created = await withServer(server1, async base => {
      const health = await fetch(`${base}/health`);
      assert.equal(health.status, 200);
      const healthBody = await health.json();
      assert.equal(healthBody.buildId, process.env.EPER_BUILD_ID);
      return request(base, { operation: "create", record: { id: "persisted-record", version: 1, state: "OPEN", data: { proof: "restart" } } });
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.result.data.payload.record.id, "persisted-record");

    const server2 = createAppServer();
    const fetched = await withServer(server2, base => request(base, { operation: "get", id: "persisted-record" }));
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.result.data.payload.record.state, "OPEN");
    assert.equal(fetched.body.result.data.payload.record.data.proof, "restart");
  } finally {
    const restore = (key, value) => value === undefined ? delete process.env[key] : process.env[key] = value;
    restore("EPER_CAPABILITY_PERSISTENCE", previous.persistence);
    restore("EPER_CAPABILITY_DATA_DIRECTORY", previous.dataDirectory);
    restore("EPER_UAT_API_ENABLED", previous.enabled);
    restore("EPER_UAT_API_TOKEN", previous.token);
    restore("EPER_UAT_TENANT_ID", previous.tenant);
    restore("EPER_UAT_PRINCIPAL_ID", previous.principal);
    restore("EPER_UAT_PUBLIC_ENDPOINT_ACK", previous.acknowledgement);
    restore("EPER_BUILD_ID", previous.buildId);
    rmSync(directory, { recursive: true, force: true });
  }
});
