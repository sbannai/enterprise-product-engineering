import assert from "node:assert/strict";
import test from "node:test";
import {
  PostgresTenantProviderDefaultsRepository,
  TenantProviderDefaultConflictError,
} from "../dist/packages/integrations/postgres-tenant-provider-defaults-repository.js";

function fixture({ override = null, defaults = null, currentVersion = null } = {}) {
  const calls = [];
  let saved = defaults;
  let version = currentVersion;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO eper_tenant_provider_defaults")) {
        if (version !== null) return { rows: [], rowCount: 0 };
        saved = JSON.parse(values[2]);
        version = 1;
        return { rows: [{ policy: saved, version }], rowCount: 1 };
      }
      if (sql.includes("UPDATE eper_tenant_provider_defaults") && sql.includes("RETURNING defaults AS policy")) {
        if (version !== Number(values[4])) return { rows: [], rowCount: 0 };
        saved = JSON.parse(values[2]);
        version += 1;
        return { rows: [{ policy: saved, version }], rowCount: 1 };
      }
      if (sql.includes("SELECT version FROM eper_tenant_provider_defaults")) {
        return { rows: version === null ? [] : [{ version }], rowCount: version === null ? 0 : 1 };
      }
      if (sql.includes("SELECT defaults AS policy, version FROM eper_tenant_provider_defaults")) {
        return { rows: saved === null ? [] : [{ policy: saved, version }], rowCount: saved === null ? 0 : 1 };
      }
      if (sql.includes("SELECT policy FROM eper_application_provider_policies")) {
        return { rows: override === null ? [] : [{ policy: override }], rowCount: override === null ? 0 : 1 };
      }
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return {
    repository: new PostgresTenantProviderDefaultsRepository({ async connect() { return client; } }),
    calls,
  };
}

const audit = {
  tenantId: "tenant-a", connectionId: "connection-a", actorId: "admin-1",
  correlationId: "provider-default-test", auditEnvironment: "sandbox",
};

test("tenant defaults are created with an audit event and tenant-only scope", async () => {
  const { repository, calls } = fixture();
  const saved = await repository.saveTenantDefault({
    ...audit, defaults: { retryLimit: 3 }, expectedVersion: 0,
  });
  assert.deepEqual(saved, { defaults: { retryLimit: 3 }, version: 1 });
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.tenant_id'") && call.values[0] === "tenant-a"));
  assert.ok(!calls.some(call => call.sql.includes("set_config('eper.application_id'")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("tenant defaults use optimistic version updates and reject stale writes", async () => {
  const { repository, calls } = fixture({ defaults: { retryLimit: 3 }, currentVersion: 2 });
  const updated = await repository.saveTenantDefault({
    ...audit, defaults: { retryLimit: 4 }, expectedVersion: 2,
  });
  assert.deepEqual(updated, { defaults: { retryLimit: 4 }, version: 3 });
  await assert.rejects(() => repository.saveTenantDefault({
    ...audit, defaults: { retryLimit: 5 }, expectedVersion: 2,
  }), error => error instanceof TenantProviderDefaultConflictError && error.currentVersion === 3);
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
});

test("tenant defaults reject nested credential keys before database access", async () => {
  const { repository, calls } = fixture();
  await assert.rejects(() => repository.saveTenantDefault({
    ...audit, defaults: { notification: { client_secret: "never-store" } }, expectedVersion: 0,
  }), /TENANT_PROVIDER_DEFAULTS_SECRET_KEY_FORBIDDEN/);
  assert.equal(calls.length, 0);
});

test("application override wins over tenant default", async () => {
  const { repository, calls } = fixture({
    override: { approvalRequired: true },
    defaults: { retryLimit: 4 },
    currentVersion: 2,
  });
  const effective = await repository.resolveEffectivePolicy({
    tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
  });
  assert.deepEqual(effective, {
    tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
    policy: { approvalRequired: true }, source: "APPLICATION_OVERRIDE", tenantDefaultVersion: 2,
  });
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.application_id'") && call.values[0] === "app-a"));
});

test("tenant default is the fallback when no application override exists", async () => {
  const { repository } = fixture({ defaults: { retryLimit: 4 }, currentVersion: 2 });
  const effective = await repository.resolveEffectivePolicy({
    tenantId: "tenant-a", applicationId: "app-b", connectionId: "connection-a",
  });
  assert.equal(effective.source, "TENANT_DEFAULT");
  assert.deepEqual(effective.policy, { retryLimit: 4 });
  assert.equal(effective.tenantDefaultVersion, 2);
});

test("missing policies resolve explicitly to no configured policy", async () => {
  const { repository } = fixture();
  const effective = await repository.resolveEffectivePolicy({
    tenantId: "tenant-a", applicationId: "app-c", connectionId: "connection-a",
  });
  assert.equal(effective.source, "NONE");
  assert.deepEqual(effective.policy, {});
});
