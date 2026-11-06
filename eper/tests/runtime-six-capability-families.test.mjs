import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createAppServer } from "../dist/apps/api/server.js";
import { requirementBindings } from "../dist/packages/requirements/registry.js";

const servers = [];
const token = "local-six-family-test-token-0123456789";

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

test("HTTP execution reaches each of the six concrete capability families", async () => {
  const keys = [
    "EPER_BUILD_ID",
    "EPER_LOCAL_CAPABILITY_API",
    "EPER_LOCAL_CAPABILITY_TOKEN",
    "EPER_LOCAL_TENANT_ID",
    "EPER_LOCAL_PRINCIPAL_ID",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_BUILD_ID: "ca185056245964aee2315abbe631c854f06a795b",
    EPER_LOCAL_CAPABILITY_API: "true",
    EPER_LOCAL_CAPABILITY_TOKEN: token,
    EPER_LOCAL_TENANT_ID: "uat-tenant",
    EPER_LOCAL_PRINCIPAL_ID: "uat-operator",
  });

  try {
    const base = await startServer();
    const cases = [
      {
        pattern: "XX01",
        payload: { operation: "create", record: { id: "uat-record-1", version: 1, state: "OPEN", data: { test: true } } },
        verify: (data) => {
          assert.equal(data.operation, "create");
          assert.equal(data.record.id, "uat-record-1");
          assert.equal(data.record.tenantId, "uat-tenant");
        },
      },
      {
        pattern: "XX02",
        payload: { operation: "decide", request: { tenantId: "uat-tenant", principalId: "uat-operator", action: "read", resource: "uat-resource" } },
        verify: (data) => {
          assert.equal(data.operation, "decide");
          assert.equal(data.decision.effect, "DENY");
        },
      },
      {
        pattern: "XX03",
        payload: { operation: "validate", input: { accepted: true } },
        verify: (data) => {
          assert.equal(data.operation, "validate");
          assert.equal(data.validation.valid, true);
        },
      },
      {
        pattern: "XX04",
        payload: { operation: "append", evidence: {
          id: "uat-evidence-1", tenantId: "uat-tenant", requirementId: "REQ-46304",
          action: "UAT_TEST", principalId: "uat-operator", correlationId: "uat-correlation-4",
          occurredAt: "2026-10-09T00:00:00.000Z", payload: { test: true },
        } },
        verify: (data) => {
          assert.equal(data.operation, "append");
          assert.match(data.evidence.integrityHash, /^[a-f0-9]{64}$/);
        },
      },
      {
        pattern: "XX05",
        payload: { operation: "create", exception: {
          id: "uat-exception-1", tenantId: "uat-tenant", requirementId: "REQ-46305",
          code: "UAT_TEST", message: "Six-family HTTP exercise",
          idempotencyKey: "uat-idempotency-5", createdAt: "2026-10-09T00:00:00.000Z",
        } },
        verify: (data) => {
          assert.equal(data.operation, "create");
          assert.equal(data.exception.state, "OPEN");
        },
      },
      {
        pattern: "XX06",
        payload: { operation: "publish", row: {
          tenantId: "uat-tenant", reportId: "uat-report-1",
          values: { test: true }, sourceRequirementIds: ["REQ-46306"],
          generatedAt: "2026-10-09T00:00:00.000Z",
        } },
        verify: (data) => {
          assert.equal(data.operation, "publish");
          assert.equal(data.published, true);
        },
      },
    ];

    for (const entry of cases) {
      const requirement = requirementBindings.find((item) => item.chapter === 463 && item.pattern === entry.pattern);
      assert.ok(requirement, `registry binding missing for ${entry.pattern}`);
      const response = await fetch(`${base}/internal/requirements/${requirement.id}/execute`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ payload: entry.payload }),
      });
      const body = await response.json();
      assert.equal(response.status, 200, `${entry.pattern}: ${JSON.stringify(body)}`);
      assert.equal(body.result.requirementId, requirement.id);
      assert.equal(body.result.pattern, entry.pattern);
      assert.equal(body.result.status, "EXECUTED");
      entry.verify(body.result.data.payload);
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
