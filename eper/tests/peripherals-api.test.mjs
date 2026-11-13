import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("application peripheral API is disabled by default", async () => {
  const previous = process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
  delete process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      "http://127.0.0.1:" + address.port + "/customer/applications/application-a/peripherals",
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
    else process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED = previous;
  }
});

test("enabled peripheral API refuses startup without durable identity and audit stores", () => {
  const keys = [
    "EPER_APPLICATION_PERIPHERAL_API_ENABLED",
    "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
    "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  try {
    assert.throws(
      () => createAppServer(),
      /CUSTOMER_IDENTITY_SESSION_STORE_REQUIRED_IN_POSTGRES_MODE/,
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("peripheral API rejects missing browser identity before reaching the service", async () => {
  const keys = [
    "EPER_APPLICATION_PERIPHERAL_API_ENABLED",
    "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
    "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE",
    "EPER_CUSTOMER_OIDC_ENABLED",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) process.env[key] = ({
    EPER_APPLICATION_PERIPHERAL_API_ENABLED: "true",
    EPER_CUSTOMER_IDENTITY_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_OIDC_ENABLED: "true",
  })[key];
  let serviceCalls = 0;
  const server = createAppServer({
    customerIdentitySessionStore: { async resolveSession() { return null; } },
    tenantApplicationAssignmentStore: { async listActive() { return ["application-01"]; } },
    actorApplicationAssignmentStore: { async isAssigned() { return true; } },
    workflowActorRoleAssignmentStore: {},
    peripheralService: { async list() { serviceCalls++; return []; } },
    customerOidcPublicOrigin: "https://customer.example.test",
    customerCsrfSecret: "c".repeat(48),
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      "http://127.0.0.1:" + address.port + "/customer/applications/application-01/peripherals",
      { headers: { cookie: "__Host-eper_session=" + "t".repeat(43) } },
    );
    assert.equal(response.status, 401);
    assert.equal(serviceCalls, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("peripheral API rejects revoked actor assignment and never calls the service", async () => {
  const keys = [
    "EPER_APPLICATION_PERIPHERAL_API_ENABLED",
    "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
    "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE",
    "EPER_CUSTOMER_OIDC_ENABLED",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_APPLICATION_PERIPHERAL_API_ENABLED: "true",
    EPER_CUSTOMER_IDENTITY_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_OIDC_ENABLED: "true",
  });
  let serviceCalls = 0;
  const server = createAppServer({
    customerIdentitySessionStore: { async resolveSession() {
      return { tenantId: "tenant-01", actorId: "actor-01", issuer: "https://idp.example.test",
        subject: "subject-01", createdAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z", idleExpiresAt: "2027-01-01T00:00:00.000Z",
        absoluteExpiresAt: "2027-01-01T00:00:00.000Z" };
    } },
    tenantApplicationAssignmentStore: { async listActive() { return ["application-01"]; } },
    actorApplicationAssignmentStore: { async isAssigned() { return false; } },
    workflowActorRoleAssignmentStore: {},
    peripheralService: { async list() { serviceCalls++; return []; } },
    customerOidcPublicOrigin: "https://customer.example.test",
    customerCsrfSecret: "c".repeat(48),
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      "http://127.0.0.1:" + address.port + "/customer/applications/application-01/peripherals",
      { headers: { cookie: "__Host-eper_session=" + "t".repeat(43) } },
    );
    assert.equal(response.status, 401);
    assert.equal(serviceCalls, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});


test("peripheral API derives dependency scope only from authenticated identity and route application", async () => {
  const keys = [
    "EPER_APPLICATION_PERIPHERAL_API_ENABLED",
    "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
    "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE",
    "EPER_CUSTOMER_OIDC_ENABLED",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_APPLICATION_PERIPHERAL_API_ENABLED: "true",
    EPER_CUSTOMER_IDENTITY_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_OIDC_ENABLED: "true",
  });
  let receivedScope;
  const server = createAppServer({
    customerIdentitySessionStore: { async resolveSession() {
      return { tenantId: "tenant-01", actorId: "actor-01", issuer: "https://idp.example.test",
        subject: "subject-01", createdAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z", idleExpiresAt: "2027-01-01T00:00:00.000Z",
        absoluteExpiresAt: "2027-01-01T00:00:00.000Z" };
    } },
    tenantApplicationAssignmentStore: { async listActive() { return ["application-01"]; } },
    actorApplicationAssignmentStore: { async isAssigned() { return true; } },
    workflowActorRoleAssignmentStore: {},
    peripheralService: { async list(scope) { receivedScope = scope; return []; } },
    customerOidcPublicOrigin: "https://customer.example.test",
    customerCsrfSecret: "c".repeat(48),
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      "http://127.0.0.1:" + address.port + "/customer/applications/application-01/peripherals",
      { headers: { cookie: "__Host-eper_session=" + "t".repeat(43) } },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(receivedScope, {
      tenantId: "tenant-01",
      applicationId: "application-01",
      actorId: "actor-01",
      environment: "sandbox",
      correlationId: receivedScope.correlationId,
    });
    assert.equal(typeof receivedScope.correlationId, "string");
    assert.equal("workstationId" in receivedScope, false);
    assert.equal("gatewayId" in receivedScope, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
