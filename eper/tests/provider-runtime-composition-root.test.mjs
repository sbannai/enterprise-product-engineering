import assert from "node:assert/strict";
import test from "node:test";
import { createProviderRuntimeComposition } from "../dist/packages/integrations/provider-runtime-composition-root.js";

const base = () => ({
  enabled: true,
  registrations: [{
    providerKey: "synthetic", adapterKey: "synthetic.mail", adapterVersion: "1.0.0",
    capabilities: ["email.send"],
    async dispatch() { return { providerReference: "synthetic-ref" }; },
  }],
  allowlist: [{
    providerKey: "synthetic", adapterKey: "synthetic.mail", adapterVersion: "1.0.0",
    capabilities: ["email.send"],
  }],
  secretReferences: {
    async getDispatchSecretReference() { return "vault://opaque"; },
    async assertDispatchAuthorization() {},
  },
  secrets: { async resolve() { return { token: "synthetic-secret" }; } },
  workerDependencies: {
    repository: {},
    payloadStore: {},
    configuration: { async resolve() { return {
      tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send",
      connectionId: "connection-a", providerKey: "synthetic", adapterKey: "synthetic.mail",
      adapterVersion: "1.0.0", connectionVersion: 1, policy: {}, policySource: "APPLICATION",
      tenantDefaultVersion: null,
    }; } },
    async authorizeOperation() { return true; },
  },
  workerOptions: {
    tenantId: "tenant-a", applicationId: "app-a", workerId: "worker-a",
    auditEnvironment: "sandbox",
  },
  wakeSource: {
    async start() {}, async wait() { return "timeout"; }, async close() {},
  },
});

test("provider runtime composition is disabled unless explicitly enabled", () => {
  const input = base();
  input.enabled = false;
  assert.equal(createProviderRuntimeComposition(input), null);
  input.enabled = undefined;
  assert.equal(createProviderRuntimeComposition(input), null);
});

test("provider runtime composition requires an executable adapter allowlist", () => {
  const input = base();
  input.registrations = [];
  assert.throws(() => createProviderRuntimeComposition(input), /PROVIDER_RUNTIME_EXECUTABLE_ADAPTERS_REQUIRED/);
});

test("provider runtime composition wires registry, scoped credentials, worker and host", () => {
  const composition = createProviderRuntimeComposition(base());
  assert.ok(composition);
  assert.equal(typeof composition.registry.resolve, "function");
  assert.equal(typeof composition.credentialResolver.resolve, "function");
  assert.equal(typeof composition.worker.runOnce, "function");
  assert.equal(typeof composition.host.run, "function");
});

test("production composition rejects synthetic adapters and missing operational guardrails", () => {
  const input = base();
  input.runtimeEnvironment = "production";
  input.workerOptions.auditEnvironment = "production";
  input.hostOptions = { onEvent() {} };
  assert.throws(() => createProviderRuntimeComposition(input), /PROVIDER_RUNTIME_PRODUCTION_GUARDRAILS_REQUIRED/);
});

test("production composition requires approved adapter attestation and bounded telemetry only", () => {
  const input = base();
  input.runtimeEnvironment = "production";
  input.workerOptions.auditEnvironment = "production";
  input.registrations[0].providerKey = "mail-provider";
  input.registrations[0].adapterKey = "mail-provider.adapter";
  input.registrations[0].executionClass = "approved";
  input.allowlist[0].providerKey = "mail-provider";
  input.allowlist[0].adapterKey = "mail-provider.adapter";
  input.allowlist[0].executionClass = "approved";
  input.hostOptions = { onEvent() {} };
  const composition = createProviderRuntimeComposition(input);
  assert.ok(composition);
});

test("production composition rejects raw-error callbacks even with approved adapters", () => {
  const input = base();
  input.runtimeEnvironment = "production";
  input.workerOptions.auditEnvironment = "production";
  input.registrations[0].providerKey = "mail-provider";
  input.registrations[0].adapterKey = "mail-provider.adapter";
  input.registrations[0].executionClass = "approved";
  input.allowlist[0].providerKey = "mail-provider";
  input.allowlist[0].adapterKey = "mail-provider.adapter";
  input.allowlist[0].executionClass = "approved";
  input.hostOptions = { onEvent() {}, onError() {} };
  assert.throws(() => createProviderRuntimeComposition(input), /PROVIDER_RUNTIME_PRODUCTION_GUARDRAILS_REQUIRED/);
});
