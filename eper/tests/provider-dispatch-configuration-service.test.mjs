import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderDispatchConfigurationError,
  ProviderDispatchConfigurationService,
} from "../dist/packages/integrations/provider-dispatch-configuration-service.js";

function connection(overrides = {}) {
  return {
    tenantId: "tenant-a",
    applicationId: "app-a",
    connectionId: "connection-a",
    providerKey: "mail-provider",
    displayName: "Mail",
    authMode: "API_KEY",
    status: "ACTIVE",
    environment: "sandbox",
    safeMetadata: {},
    version: 7,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
    bindingStatus: "ACTIVE",
    allowedCapabilities: ["email.send"],
    ...overrides,
  };
}

function service(connections, effective = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  connectionId: "connection-a",
  policy: { retryLimit: 4, senderProfile: "default" },
  source: "TENANT_DEFAULT",
  tenantDefaultVersion: 3,
}) {
  const calls = [];
  return {
    calls,
    instance: new ProviderDispatchConfigurationService(
      { async listForApplication(tenantId, applicationId) {
        calls.push({ method: "listForApplication", tenantId, applicationId });
        return connections;
      } },
      { async resolveEffectivePolicy(input) {
        calls.push({ method: "resolveEffectivePolicy", ...input });
        return effective;
      } },
    ),
  };
}

test("dispatch resolution selects only an active application binding and applies tenant defaults", async () => {
  const { instance, calls } = service([
    connection({ connectionId: "pending", status: "PENDING_VALIDATION" }),
    connection(),
  ]);
  const result = await instance.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send",
  });
  assert.equal(result.connectionId, "connection-a");
  assert.equal(result.providerKey, "mail-provider");
  assert.deepEqual(result.policy, { retryLimit: 4, senderProfile: "default" });
  assert.equal(result.policySource, "TENANT_DEFAULT");
  assert.equal(result.tenantDefaultVersion, 3);
  assert.deepEqual(calls.map(call => call.method), ["listForApplication", "resolveEffectivePolicy"]);
});

test("application override is carried into dispatch configuration", async () => {
  const { instance } = service([connection()], {
    tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
    policy: { approvalRequired: true }, source: "APPLICATION_OVERRIDE", tenantDefaultVersion: 3,
  });
  const result = await instance.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send",
  });
  assert.equal(result.policySource, "APPLICATION_OVERRIDE");
  assert.deepEqual(result.policy, { approvalRequired: true });
});

test("dispatch rejects missing, suspended and unauthorized capability bindings", async () => {
  for (const candidate of [
    [],
    [connection({ status: "SUSPENDED" })],
    [connection({ bindingStatus: "SUSPENDED" })],
    [connection({ allowedCapabilities: ["sms.send"] })],
  ]) {
    const { instance } = service(candidate);
    await assert.rejects(() => instance.resolve({
      tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send",
    }), error => error instanceof ProviderDispatchConfigurationError
      && error.code === "PROVIDER_DISPATCH_NO_ACTIVE_BINDING");
  }
});

test("dispatch rejects ambiguous active bindings rather than choosing arbitrarily", async () => {
  const { instance } = service([
    connection({ connectionId: "connection-a" }),
    connection({ connectionId: "connection-b", providerKey: "alternate-mail" }),
  ]);
  await assert.rejects(() => instance.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send",
  }), error => error instanceof ProviderDispatchConfigurationError
    && error.code === "PROVIDER_DISPATCH_AMBIGUOUS_BINDING");
});

test("dispatch rejects absent policy and never exposes secret references", async () => {
  const { instance } = service([connection()], {
    tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
    policy: {}, source: "NONE", tenantDefaultVersion: null,
  });
  await assert.rejects(() => instance.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send",
  }), error => error instanceof ProviderDispatchConfigurationError
    && error.code === "PROVIDER_DISPATCH_POLICY_INVALID");
});

test("dispatch validates required tenant, application and capability identifiers", async () => {
  const { instance } = service([connection()]);
  await assert.rejects(() => instance.resolve({
    tenantId: " ", applicationId: "app-a", capabilityKey: "email.send",
  }), /PROVIDER_DISPATCH_TENANT_INVALID/);
});

test("dispatch rejects policy returned for a different tenant, application or connection", async () => {
  for (const effective of [
    { tenantId: "tenant-b", applicationId: "app-a", connectionId: "connection-a",
      policy: { retryLimit: 1 }, source: "TENANT_DEFAULT", tenantDefaultVersion: 1 },
    { tenantId: "tenant-a", applicationId: "app-b", connectionId: "connection-a",
      policy: { retryLimit: 1 }, source: "TENANT_DEFAULT", tenantDefaultVersion: 1 },
    { tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-b",
      policy: { retryLimit: 1 }, source: "TENANT_DEFAULT", tenantDefaultVersion: 1 },
  ]) {
    const { instance } = service([connection()], effective);
    await assert.rejects(() => instance.resolve({
      tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send",
    }), error => error instanceof ProviderDispatchConfigurationError
      && error.code === "PROVIDER_DISPATCH_POLICY_SCOPE_MISMATCH");
  }
});
test("dispatch rejects malformed policy provenance and invalid tenant-default versions", async () => {
  for (const effective of [
    { tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
      policy: { retryLimit: 1 }, source: "UNTRUSTED", tenantDefaultVersion: 1 },
    { tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
      policy: { retryLimit: 1 }, source: "TENANT_DEFAULT", tenantDefaultVersion: 0 },
  ]) {
    const { instance } = service([connection()], effective);
    await assert.rejects(() => instance.resolve({
      tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send",
    }), error => error instanceof ProviderDispatchConfigurationError
      && error.code === "PROVIDER_DISPATCH_POLICY_INVALID");
  }
});
