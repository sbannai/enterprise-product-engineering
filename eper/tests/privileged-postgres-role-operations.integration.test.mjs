import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresPlatformAdminCredentialStore } from "../dist/packages/identity/postgres-platform-admin-credential-store.js";
import { PostgresProviderCatalogueRepository } from "../dist/packages/integrations/postgres-provider-catalogue-repository.js";

const { Pool } = pg;
const platformUrl = process.env.EPER_PLATFORM_ADMIN_TEST_DATABASE_URL;
const catalogueUrl = process.env.EPER_PROVIDER_CATALOGUE_TEST_DATABASE_URL;
const ownerUrl = process.env.DATABASE_URL;
const suffix = randomUUID().replaceAll("-", "").slice(0, 18);
const context = { actorId: "role-test-actor-" + suffix, correlationId: "role-test-" + suffix };

test("dedicated platform-admin role performs credential lifecycle and rolls back when audit append fails",
  { skip: !platformUrl || !ownerUrl }, async () => {
    const runtimePool = new Pool({ connectionString: platformUrl, max: 2 });
    const ownerPool = new Pool({ connectionString: ownerUrl, max: 2 });
    const store = new PostgresPlatformAdminCredentialStore(runtimePool);
    const credentialId = "role-test-credential-" + suffix;
    const actorId = "role-test-platform-actor-" + suffix;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    try {
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM eper_audit_events WHERE resource_id=$1",
        [credentialId],
      );
      await assert.rejects(
        store.issue({ ...context, credentialId, platformActorId: actorId,
          permissions: ["platform_admin:credentials:manage"], expiresAt, environment: "invalid" }),
      );
      const afterFailure = await ownerPool.query(
        "SELECT count(*)::int AS count FROM eper_platform_admin_credentials WHERE credential_id=$1",
        [credentialId],
      );
      const auditAfterFailure = await ownerPool.query(
        "SELECT count(*)::int AS count FROM eper_audit_events WHERE resource_id=$1",
        [credentialId],
      );
      assert.equal(afterFailure.rows[0].count, 0, "credential insert must roll back with failed audit append");
      assert.equal(auditAfterFailure.rows[0].count, before.rows[0].count, "failed operation must not leave an audit row");

      const issued = await store.issue({ ...context, credentialId, platformActorId: actorId,
        permissions: ["platform_admin:credentials:manage"], expiresAt, environment: "sandbox" });
      assert.equal(typeof issued.bearerToken, "string");
      assert.ok(issued.bearerToken.length >= 32);
      assert.deepEqual((await store.resolve(issued.bearerToken))?.permissions,
        ["platform_admin:credentials:manage"]);
      assert.equal(await store.revoke({ ...context, credentialId, environment: "sandbox" }), true);
      assert.equal(await store.resolve(issued.bearerToken), null);
      const audit = await ownerPool.query(
        "SELECT action FROM eper_audit_events WHERE resource_id=$1 ORDER BY occurred_at, action",
        [credentialId],
      );
      assert.deepEqual(audit.rows.map(row => row.action).sort(),
        ["platform_admin.credential.issue", "platform_admin.credential.revoke"].sort());
    } finally {
      await runtimePool.end();
      await ownerPool.end();
    }
  });

test("dedicated provider-catalogue role performs audited create and rolls back catalogue mutation on audit failure",
  { skip: !catalogueUrl || !ownerUrl }, async () => {
    const runtimePool = new Pool({ connectionString: catalogueUrl, max: 2 });
    const ownerPool = new Pool({ connectionString: ownerUrl, max: 2 });
    const repository = new PostgresProviderCatalogueRepository(runtimePool, {
      adapterKeys: ["role-test-adapter"],
      capabilityKeys: ["email.send"],
      authModes: ["oauth"],
    });
    const providerKey = "role-test-provider-" + suffix;
    const input = { ...context, providerKey, displayName: "Role test provider",
      adapterKey: "role-test-adapter", adapterVersion: "1",
      capabilities: ["email.send"], authModes: ["oauth"],
      configurationSchema: { type: "object", properties: {} } };
    try {
      const before = await ownerPool.query(
        "SELECT count(*)::int AS count FROM eper_audit_events WHERE resource_id=$1",
        [providerKey],
      );
      await assert.rejects(repository.create({ ...input, environment: "invalid" }));
      const afterFailure = await ownerPool.query(
        "SELECT count(*)::int AS count FROM eper_provider_definitions WHERE provider_key=$1",
        [providerKey],
      );
      const auditAfterFailure = await ownerPool.query(
        "SELECT count(*)::int AS count FROM eper_audit_events WHERE resource_id=$1",
        [providerKey],
      );
      assert.equal(afterFailure.rows[0].count, 0, "catalogue insert must roll back with failed audit append");
      assert.equal(auditAfterFailure.rows[0].count, before.rows[0].count, "failed operation must not leave an audit row");

      const created = await repository.create({ ...input, environment: "sandbox" });
      assert.equal(created.providerKey, providerKey);
      assert.equal(created.version, 1);

      await assert.rejects(repository.update({
        ...context, providerKey, expectedVersion: 1, displayName: "Must roll back",
        environment: "invalid",
      }));
      const afterUpdateRollback = await repository.get(providerKey);
      assert.equal(afterUpdateRollback?.displayName, "Role test provider");
      assert.equal(afterUpdateRollback?.version, 1);

      const updated = await repository.update({
        ...context, providerKey, expectedVersion: 1,
        displayName: "Role test provider updated", environment: "sandbox",
      });
      assert.equal(updated.version, 2);
      assert.equal(updated.displayName, "Role test provider updated");

      await assert.rejects(repository.setStatus({
        ...context, providerKey, expectedVersion: 2, status: "SUSPENDED",
        environment: "invalid",
      }));
      const afterStatusRollback = await repository.get(providerKey);
      assert.equal(afterStatusRollback?.status, "ACTIVE");
      assert.equal(afterStatusRollback?.version, 2);

      const suspended = await repository.setStatus({
        ...context, providerKey, expectedVersion: 2, status: "SUSPENDED",
        environment: "sandbox",
      });
      assert.equal(suspended.status, "SUSPENDED");
      assert.equal(suspended.version, 3);

      const results = await Promise.allSettled([
        repository.update({ ...context, providerKey, expectedVersion: 3,
          displayName: "Concurrent A", environment: "sandbox" }),
        repository.update({ ...context, providerKey, expectedVersion: 3,
          displayName: "Concurrent B", environment: "sandbox" }),
      ]);
      assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
      assert.equal(results.filter(x => x.status === "rejected").length, 1);
      const rejected = results.find(x => x.status === "rejected");
      assert.equal(rejected.reason?.message, "PROVIDER_CATALOGUE_VERSION_CONFLICT");
      assert.equal(rejected.reason?.currentVersion, 4);
      const current = await repository.get(providerKey);
      assert.equal(current?.version, 4);
      assert.ok(["Concurrent A", "Concurrent B"].includes(current?.displayName));
      await assert.rejects(
        repository.update({ ...context, providerKey, expectedVersion: 3,
          displayName: "Stale update", environment: "sandbox" }),
        error => error?.message === "PROVIDER_CATALOGUE_VERSION_CONFLICT" && error.currentVersion === 4,
      );

      const audit = await ownerPool.query(
        "SELECT action FROM eper_audit_events WHERE resource_id=$1 ORDER BY occurred_at, action",
        [providerKey],
      );
      assert.deepEqual(audit.rows.map(row => row.action).sort(), [
        "provider.catalogue.create", "provider.catalogue.update",
        "provider.catalogue.update", "provider.catalogue.suspended",
      ].sort());
    } finally {
      await runtimePool.end();
      await ownerPool.end();
    }
  });
