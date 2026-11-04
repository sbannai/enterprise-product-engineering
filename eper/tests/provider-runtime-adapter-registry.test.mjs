import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderRuntimeAdapterRegistry,
  ProviderRuntimeRegistryError,
} from "../dist/packages/integrations/provider-runtime-adapter-registry.js";

const capability = "storage.upload";
const allowlist = [
  {
    providerKey: "aws-s3",
    adapterKey: "storage.aws-s3",
    adapterVersion: "1.0.0",
    capabilities: [capability, "storage.download"],
  },
];
const adapter = {
  providerKey: "aws-s3",
  adapterKey: "storage.aws-s3",
  adapterVersion: "1.0.0",
  capabilities: [capability, "storage.download"],
  async dispatch(input) {
    return { providerReference: input.idempotencyKey };
  },
};

test("runtime registry resolves only an explicitly allowlisted provider/version/capability", () => {
  const registry = new ProviderRuntimeAdapterRegistry([adapter], allowlist);
  assert.equal(registry.resolve({ providerKey: "aws-s3", capabilityKey: capability }).adapterVersion, "1.0.0");
});

test("empty runtime registry fails closed", () => {
  const registry = new ProviderRuntimeAdapterRegistry([], []);
  assert.throws(
    () => registry.resolve({ providerKey: "aws-s3", capabilityKey: capability }),
    error => error instanceof ProviderRuntimeRegistryError
      && error.code === "PROVIDER_RUNTIME_ADAPTER_UNAVAILABLE",
  );
});

test("runtime registry rejects adapters absent from the deployment allowlist", () => {
  assert.throws(
    () => new ProviderRuntimeAdapterRegistry([adapter], []),
    error => error.code === "PROVIDER_RUNTIME_NOT_ALLOWLISTED",
  );
});

test("runtime registry rejects duplicate provider/version registrations", () => {
  assert.throws(
    () => new ProviderRuntimeAdapterRegistry([adapter, adapter], allowlist),
    error => error.code === "PROVIDER_RUNTIME_DUPLICATE_REGISTRATION",
  );
});

test("runtime registry rejects duplicate allowlist entries", () => {
  assert.throws(
    () => new ProviderRuntimeAdapterRegistry([], [...allowlist, ...allowlist]),
    error => error.code === "PROVIDER_RUNTIME_DUPLICATE_REGISTRATION",
  );
});

test("runtime registry rejects capability escalation beyond the allowlist", () => {
  const escalated = { ...adapter, capabilities: [capability, "storage.delete"] };
  assert.throws(
    () => new ProviderRuntimeAdapterRegistry([escalated], allowlist),
    error => error.code === "PROVIDER_RUNTIME_NOT_ALLOWLISTED",
  );
});

test("runtime registry rejects unsupported capabilities", () => {
  const registry = new ProviderRuntimeAdapterRegistry([adapter], allowlist);
  assert.throws(
    () => registry.resolve({ providerKey: "aws-s3", capabilityKey: "storage.delete" }),
    error => error.code === "PROVIDER_RUNTIME_CAPABILITY_UNSUPPORTED",
  );
});

test("multiple installed versions require an explicit version and never select latest implicitly", () => {
  const second = { ...adapter, adapterVersion: "2.0.0" };
  const secondAllowlist = { ...allowlist[0], adapterVersion: "2.0.0" };
  const registry = new ProviderRuntimeAdapterRegistry(
    [adapter, second],
    [...allowlist, secondAllowlist],
  );
  assert.throws(
    () => registry.resolve({ providerKey: "aws-s3", capabilityKey: capability }),
    error => error.code === "PROVIDER_RUNTIME_ADAPTER_UNAVAILABLE",
  );
  assert.equal(
    registry.resolve({ providerKey: "aws-s3", capabilityKey: capability, adapterVersion: "2.0.0" }).adapterVersion,
    "2.0.0",
  );
});

test("dispatch passes idempotency and correlation context to the resolved adapter", async () => {
  const registry = new ProviderRuntimeAdapterRegistry([adapter], allowlist);
  const result = await registry.dispatch({
    selection: { providerKey: "aws-s3", capabilityKey: capability },
    payload: { objectKey: "opaque-reference" },
    idempotencyKey: "asset-upload-001",
    correlationId: "correlation-001",
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, { providerReference: "asset-upload-001" });
});

test("dispatch rejects missing idempotency and cancellation context", async () => {
  const registry = new ProviderRuntimeAdapterRegistry([adapter], allowlist);
  await assert.rejects(
    () => registry.dispatch({
      selection: { providerKey: "aws-s3", capabilityKey: capability },
      payload: {},
      idempotencyKey: "",
      correlationId: "correlation-001",
      signal: new AbortController().signal,
    }),
    error => error.code === "PROVIDER_RUNTIME_REGISTRATION_INVALID",
  );
});
