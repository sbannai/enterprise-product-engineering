import assert from "node:assert/strict";
import test from "node:test";
import { createProviderOperationWorkerWithRuntimeRegistry } from "../dist/packages/integrations/provider-runtime-worker-composition.js";
import { ProviderRuntimeAdapterRegistry } from "../dist/packages/integrations/provider-runtime-adapter-registry.js";

const operation = {
  operationId: "operation-12345678",
  tenantId: "tenant-a",
  applicationId: "app-a",
  connectionId: "connection-a",
  capabilityKey: "email.send",
  capabilityVersion: "1.0.0",
  idempotencyKey: "idem-12345678",
  correlationId: "corr-12345678",
  status: "DISPATCHING",
  requestDigest: "a".repeat(64),
  payloadReference: "pp_12345678",
  providerReference: null,
  leaseOwner: "worker-test",
  leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  fencingToken: 3,
  attemptCount: 1,
  availableAt: new Date().toISOString(),
  lastErrorCode: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const options = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  workerId: "worker-test",
  auditEnvironment: "sandbox",
  leaseDurationSeconds: 30,
};

function dependencies(runtimeRegistry, calls) {
  let claimCount = 0;
  return {
    runtimeRegistry,
    repository: {
      async recoverExpiredLeases() { return []; },
      async claimNext() { claimCount += 1; return claimCount === 1 ? operation : null; },
      async renewLease() { return operation; },
      async recordOutcome(input) { calls.outcomes.push(input); return operation; },
    },
    payloadStore: {
      async get(input) {
        assert.equal(input.digest, operation.requestDigest);
        return { message: "synthetic payload" };
      },
    },
    configuration: {
      async resolve() {
        return {
          tenantId: "tenant-a",
          applicationId: "app-a",
          capabilityKey: "email.send",
          connectionId: "connection-a",
          providerKey: "synthetic",
          adapterKey: "synthetic.mail",
          adapterVersion: "1.0.0",
          connectionVersion: 1,
          policy: {},
          policySource: "APPLICATION",
          tenantDefaultVersion: null,
        };
      },
    },
    async authorizeOperation() { return true; },
  };
}

test("worker composition dispatches only through the exact runtime registry identity", async () => {
  const calls = { dispatches: [], outcomes: [] };
  const adapter = {
    providerKey: "synthetic",
    adapterKey: "synthetic.mail",
    adapterVersion: "1.0.0",
    capabilities: ["email.send"],
    async dispatch(input) {
      calls.dispatches.push(input);
      return { providerReference: "synthetic-runtime-reference" };
    },
  };
  const registry = new ProviderRuntimeAdapterRegistry([adapter], [{
    providerKey: "synthetic",
    adapterKey: "synthetic.mail",
    adapterVersion: "1.0.0",
    capabilities: ["email.send"],
  }]);

  const worker = createProviderOperationWorkerWithRuntimeRegistry(
    dependencies(registry, calls),
    options,
  );
  const result = await worker.runOnce();

  assert.equal(result.succeeded, 1);
  assert.equal(result.retried, 0);
  assert.equal(calls.dispatches.length, 1);
  assert.deepEqual(calls.dispatches[0].selection, {
    providerKey: "synthetic",
    adapterKey: "synthetic.mail",
    adapterVersion: "1.0.0",
    capabilityKey: "email.send",
  });
  assert.equal(calls.dispatches[0].idempotencyKey, operation.idempotencyKey);
  assert.equal(calls.dispatches[0].correlationId, operation.correlationId);
  assert.deepEqual(calls.outcomes[0].outcome, "SUCCEEDED");
  assert.equal(calls.outcomes[0].providerReference, "synthetic-runtime-reference");
});

test("empty runtime registry parks provider work without consuming retry attempts", async () => {
  const calls = { dispatches: [], outcomes: [] };
  const registry = new ProviderRuntimeAdapterRegistry([], []);
  const worker = createProviderOperationWorkerWithRuntimeRegistry(
    dependencies(registry, calls),
    options,
  );

  const result = await worker.runOnce();

  assert.equal(result.needsAttention, 1);
  assert.equal(result.retried, 0);
  assert.equal(calls.dispatches.length, 0);
  assert.equal(calls.outcomes[0].outcome, "NEEDS_ATTENTION");
  assert.equal(calls.outcomes[0].errorCode, "PROVIDER_RUNTIME_ADAPTER_UNAVAILABLE");
});

test("worker composition requires an explicit registry", () => {
  assert.throws(
    () => createProviderOperationWorkerWithRuntimeRegistry({ runtimeRegistry: null }, options),
    /PROVIDER_RUNTIME_REGISTRY_REQUIRED/,
  );
});
