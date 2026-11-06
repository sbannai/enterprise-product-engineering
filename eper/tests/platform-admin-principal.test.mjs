import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlatformAdminPrincipal, resolvePlatformAdminPrincipalFromStore } from "../dist/packages/identity/platform-admin-principal.js";

const provisionCredential = "provision-secret-credential-0000000001";
const recoverCredential = "recover-secret-credential-00000000000001";
const remediationCredential = "remediate-secret-credential-00000001";
const catalogueCredential = "provider-catalogue-admin-credential-00001";

function mapping(overrides = {}) {
  return JSON.stringify({
    [provisionCredential]: {
      platformActorId: "platform-operator-01",
      permissions: ["customer_admin:provision"],
      credentialId: "platform-key-rotation-01",
    },
    [recoverCredential]: {
      platformActorId: "platform-breakglass-01",
      permissions: ["customer_admin:recover"],
      credentialId: "platform-key-rotation-02",
    },
    [remediationCredential]: {
      platformActorId: "platform-remediation-01",
      permissions: ["application:remediate"],
      credentialId: "platform-key-rotation-03",
    },
    [catalogueCredential]: {
      platformActorId: "platform-catalogue-admin-01",
      permissions: ["provider_catalogue:manage"],
      credentialId: "platform-key-rotation-04",
    },
    ...overrides,
  });
}

test("platform principal resolver returns only server-mapped identity and permission", () => {
  const principal = resolvePlatformAdminPrincipal(
    `Bearer ${provisionCredential}`, mapping(),
  );
  assert.deepEqual(principal, {
    platformActorId: "platform-operator-01",
    permissions: ["customer_admin:provision"],
    credentialId: "platform-key-rotation-01",
  });
  assert.equal(JSON.stringify(principal).includes(provisionCredential), false);
  assert.equal("tenantId" in principal, false);
  assert.equal("applicationId" in principal, false);
  assert.equal("actorId" in principal, false);
});

test("provision and recovery permissions remain independent", () => {
  const provision = resolvePlatformAdminPrincipal(`Bearer ${provisionCredential}`, mapping());
  const recover = resolvePlatformAdminPrincipal(`Bearer ${recoverCredential}`, mapping());
  assert.deepEqual(provision?.permissions, ["customer_admin:provision"]);
  assert.deepEqual(recover?.permissions, ["customer_admin:recover"]);
  assert.equal(provision?.permissions.includes("customer_admin:recover"), false);
  assert.equal(recover?.permissions.includes("customer_admin:provision"), false);
});

test("unknown, malformed, short and non-bearer credentials fail closed", () => {
  assert.equal(resolvePlatformAdminPrincipal(undefined, mapping()), null);
  assert.equal(resolvePlatformAdminPrincipal("Basic abc", mapping()), null);
  assert.equal(resolvePlatformAdminPrincipal("Bearer short", mapping()), null);
  assert.equal(resolvePlatformAdminPrincipal("Bearer " + "x".repeat(33), mapping()), null);
  assert.equal(resolvePlatformAdminPrincipal(`Bearer ${provisionCredential}`, "{"), null);
  assert.equal(resolvePlatformAdminPrincipal(`Bearer ${provisionCredential}`, "[]"), null);
});

test("invalid permission, malformed identity, and malformed mapping entries fail closed", () => {
  const invalidPermission = JSON.stringify({
    [provisionCredential]: {
      platformActorId: "operator", permissions: ["platform:everything"], credentialId: "key-1",
    },
  });
  const missingActor = JSON.stringify({
    [provisionCredential]: {
      platformActorId: "", permissions: ["customer_admin:provision"], credentialId: "key-1",
    },
  });
  const shortMappedCredential = JSON.stringify({
    short: {
      platformActorId: "operator", permissions: ["customer_admin:provision"], credentialId: "key-1",
    },
  });
  assert.equal(resolvePlatformAdminPrincipal(`Bearer ${provisionCredential}`, invalidPermission), null);
  assert.equal(resolvePlatformAdminPrincipal(`Bearer ${provisionCredential}`, missingActor), null);
  assert.equal(resolvePlatformAdminPrincipal(`Bearer ${provisionCredential}`, shortMappedCredential), null);
});

test("duplicate permissions and empty permission sets fail closed", () => {
  const duplicate = JSON.stringify({
    [provisionCredential]: {
      platformActorId: "operator",
      permissions: ["customer_admin:provision", "customer_admin:provision"],
      credentialId: "key-1",
    },
  });
  const empty = JSON.stringify({
    [provisionCredential]: {
      platformActorId: "operator", permissions: [], credentialId: "key-1",
    },
  });
  assert.equal(resolvePlatformAdminPrincipal(`Bearer ${provisionCredential}`, duplicate), null);
  assert.equal(resolvePlatformAdminPrincipal(`Bearer ${provisionCredential}`, empty), null);
});

test("application remediation permission is independently assignable and does not imply customer-admin authority", () => {
  const principal = resolvePlatformAdminPrincipal(`Bearer ${remediationCredential}`, mapping());
  assert.deepEqual(principal, {
    platformActorId: "platform-remediation-01",
    permissions: ["application:remediate"],
    credentialId: "platform-key-rotation-03",
  });
  assert.equal(principal?.permissions.includes("customer_admin:provision"), false);
  assert.equal(principal?.permissions.includes("customer_admin:recover"), false);
});

test("provider catalogue permission is independently assignable and does not imply tenant or customer authority", () => {
  const principal = resolvePlatformAdminPrincipal(`Bearer ${catalogueCredential}`, mapping());
  assert.deepEqual(principal, {
    platformActorId: "platform-catalogue-admin-01",
    permissions: ["provider_catalogue:manage"],
    credentialId: "platform-key-rotation-04",
  });
  assert.equal(principal?.permissions.includes("customer_admin:provision"), false);
  assert.equal(principal?.permissions.includes("customer_admin:recover"), false);
  assert.equal(principal?.permissions.includes("application:remediate"), false);
});


test("durable resolver derives platform principal only from PostgreSQL credential resolution", async () => {
  const calls = [];
  const store = { async resolve(token) {
    calls.push(token);
    return { credentialId: "durable-key-01", platformActorId: "durable-operator-01", permissions: ["customer_admin:provision"] };
  } };
  const principal = await resolvePlatformAdminPrincipalFromStore(`Bearer ${provisionCredential}`, store);
  assert.deepEqual(principal, {
    credentialId: "durable-key-01", platformActorId: "durable-operator-01", permissions: ["customer_admin:provision"],
  });
  assert.deepEqual(calls, [provisionCredential]);
  assert.equal("tenantId" in principal, false);
});

test("durable resolver rejects malformed bearer credentials without querying the store", async () => {
  let calls = 0;
  const store = { async resolve() { calls += 1; return null; } };
  assert.equal(await resolvePlatformAdminPrincipalFromStore("Basic abc", store), null);
  assert.equal(await resolvePlatformAdminPrincipalFromStore("Bearer short", store), null);
  assert.equal(calls, 0);
});
