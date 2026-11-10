import test from "node:test";
import assert from "node:assert/strict";
import { ProviderOperationWorker } from "../dist/packages/integrations/provider-operation-worker.js";
import { ProviderDispatchConfigurationError } from "../dist/packages/integrations/provider-dispatch-configuration-service.js";

const operation = {
  operationId: "operation-12345678", tenantId: "tenant-a", applicationId: "app-a",
  connectionId: "connection-a", capabilityKey: "email.send", capabilityVersion: "1.0.0",
  idempotencyKey: "idem-12345678", correlationId: "corr-12345678", status: "DISPATCHING",
  requestDigest: "a".repeat(64), payloadReference: "pp_12345678", providerReference: null,
  leaseOwner: "worker-test", leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
  fencingToken: 3, attemptCount: 1, availableAt: new Date().toISOString(),
  lastErrorCode: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
function harness(overrides = {}) {
  const calls = { recovery: 0, claims: 0, outcomes: [], renewals: 0, dispatches: 0 };
  const repository = {
    async recoverExpiredLeases() { calls.recovery++; return []; },
    async claimNext() { calls.claims++; return calls.claims === 1 ? operation : null; },
    async renewLease() { calls.renewals++; return operation; },
    async recordOutcome(input) { calls.outcomes.push(input); return operation; },
  };
  const dependencies = {
    repository,
    payloadStore: { async get(input) { assert.equal(input.digest, operation.requestDigest); return { to: "synthetic@example.invalid" }; } },
    configuration: { async resolve() { return { tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "email.send", connectionId: "connection-a", providerKey: "synthetic", connectionVersion: 1, policy: {}, policySource: "APPLICATION", tenantDefaultVersion: null }; } },
    async authorizeOperation() { return true; },
    async dispatch() { calls.dispatches++; return { providerReference: "synthetic-ref-1" }; },
    ...overrides,
  };
  return { calls, dependencies };
}
const options = { tenantId: "tenant-a", applicationId: "app-a", workerId: "worker-test", auditEnvironment: "sandbox", leaseDurationSeconds: 30 };

test("provider worker performs bounded recovery, claims, scoped payload read and fenced success", async () => {
  const { calls, dependencies } = harness();
  const worker = new ProviderOperationWorker(dependencies, options);
  const result = await worker.runOnce();
  assert.deepEqual(result, { recovered: 0, claimed: 1, succeeded: 1, retried: 0, needsAttention: 0, leaseLost: 0 });
  assert.equal(calls.recovery, 1);
  assert.equal(calls.dispatches, 1);
  assert.equal(calls.outcomes[0].outcome, "SUCCEEDED");
  assert.equal(calls.outcomes[0].fencingToken, operation.fencingToken);
  assert.equal(calls.outcomes[0].providerReference, "synthetic-ref-1");
});

test("provider worker fails closed on authorization denial without reading payload or dispatching", async () => {
  const { calls, dependencies } = harness({
    async authorizeOperation() { return false; },
    payloadStore: { async get() { assert.fail("payload must not be read"); } },
  });
  const worker = new ProviderOperationWorker(dependencies, options);
  const result = await worker.runOnce();
  assert.equal(result.needsAttention, 1);
  assert.equal(calls.dispatches, 0);
  assert.equal(calls.outcomes[0].errorCode, "PROVIDER_OPERATION_AUTHORIZATION_DENIED");
});

test("provider worker rejects a route resolved for a different tenant or application", async () => {
  for (const selection of [
    { tenantId: "tenant-b", applicationId: "app-a", connectionId: "connection-a", capabilityKey: "email.send" },
    { tenantId: "tenant-a", applicationId: "app-b", connectionId: "connection-a", capabilityKey: "email.send" },
  ]) {
    const { calls, dependencies } = harness({
      configuration: { async resolve() { return selection; } },
    });
    const worker = new ProviderOperationWorker(dependencies, options);
    const result = await worker.runOnce();
    assert.equal(result.needsAttention, 1);
    assert.equal(calls.dispatches, 0);
    assert.equal(calls.outcomes[0].errorCode, "PROVIDER_OPERATION_ROUTE_MISMATCH");
  }
});

test("provider worker retries with a safe code and never stores adapter exception text", async () => {
  const { calls, dependencies } = harness({
    async dispatch() { throw new Error("secret-token-and-private-body"); },
  });
  const worker = new ProviderOperationWorker(dependencies, options);
  const result = await worker.runOnce();
  assert.equal(result.retried, 1);
  assert.equal(calls.outcomes[0].outcome, "RETRY");
  assert.equal(calls.outcomes[0].errorCode, "PROVIDER_OPERATION_DISPATCH_FAILED");
  assert.equal(JSON.stringify(calls.outcomes).includes("secret-token"), false);
});

test("provider worker parks deterministic configuration blockers without reading payload or dispatching", async () => {
  for (const code of [
    "PROVIDER_DISPATCH_NO_ACTIVE_BINDING",
    "PROVIDER_DISPATCH_AMBIGUOUS_BINDING",
    "PROVIDER_DISPATCH_POLICY_INVALID",
  ]) {
    const { calls, dependencies } = harness({
      configuration: { async resolve() { throw new ProviderDispatchConfigurationError(code); } },
      payloadStore: { async get() { assert.fail("payload must not be read for a configuration blocker"); } },
    });
    const worker = new ProviderOperationWorker(dependencies, options);
    const result = await worker.runOnce();
    assert.equal(result.needsAttention, 1);
    assert.equal(result.retried, 0);
    assert.equal(calls.dispatches, 0);
    assert.equal(calls.outcomes[0].outcome, "NEEDS_ATTENTION");
    assert.equal(calls.outcomes[0].errorCode, code);
  }
});

test("provider worker rejects mismatched resolved connection without dispatch", async () => {
  const { calls, dependencies } = harness({
    configuration: { async resolve() { return { connectionId: "different-connection", capabilityKey: "email.send" }; } },
  });
  const worker = new ProviderOperationWorker(dependencies, options);
  const result = await worker.runOnce();
  assert.equal(result.needsAttention, 1);
  assert.equal(calls.dispatches, 0);
});


test("provider worker shutdown during authorization never persists an outcome", async () => {
  for (const authorizationResult of [true, false]) {
    let markStarted;
    let release;
    const started = new Promise(resolve => { markStarted = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const { calls, dependencies } = harness({
      async authorizeOperation() { markStarted(); await gate; return authorizationResult; },
      payloadStore: { async get() { assert.fail("payload read after shutdown"); } },
    });
    const worker = new ProviderOperationWorker(dependencies, options);
    const shutdown = new AbortController();
    const running = worker.runOnce(shutdown.signal);
    await started;
    shutdown.abort(new Error("test shutdown during authorization"));
    release();
    const result = await running;
    assert.equal(calls.outcomes.length, 0);
    assert.equal(calls.dispatches, 0);
    assert.equal(result.needsAttention, 0);
  }
});

test("provider worker lease loss during an awaited authorization fences all later work without wall-clock sleeps", async () => {
  let markStarted;
  let release;
  let heartbeat;
  let markRenewalStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const renewalStarted = new Promise(resolve => { markRenewalStarted = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const { calls, dependencies } = harness({
    repository: {
      async recoverExpiredLeases() { return []; },
      async claimNext() { return calls.claims++ === 0 ? operation : null; },
      async renewLease() { markRenewalStarted(); throw new Error("simulated lease lost"); },
      async recordOutcome(input) { calls.outcomes.push(input); return operation; },
    },
    scheduleHeartbeat(callback) { heartbeat = callback; return () => {}; },
    async authorizeOperation() { markStarted(); await gate; return true; },
    payloadStore: { async get() { assert.fail("payload read after lease loss"); } },
  });
  const worker = new ProviderOperationWorker(dependencies, options);
  const running = worker.runOnce();
  await started;
  assert.equal(typeof heartbeat, "function");
  heartbeat();
  await renewalStarted;
  await Promise.resolve();
  await Promise.resolve();
  release();
  const result = await running;
  assert.equal(result.leaseLost, 1);
  assert.equal(result.needsAttention, 0);
  assert.equal(calls.outcomes.length, 0);
  assert.equal(calls.dispatches, 0);
});

test("provider worker shutdown during configuration resolution never persists a blocker outcome", async () => {
  for (const rejectWithBlocker of [false, true]) {
    let markStarted;
    let release;
    const started = new Promise(resolve => { markStarted = resolve; });
    const gate = new Promise((resolve, reject) => { release = rejectWithBlocker ? () => reject(new ProviderDispatchConfigurationError("PROVIDER_DISPATCH_POLICY_INVALID")) : () => resolve(); });
    const { calls, dependencies } = harness({
      configuration: { async resolve() {
        markStarted();
        await gate;
        return { tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a", capabilityKey: "email.send" };
      } },
      payloadStore: { async get() { assert.fail("payload read after shutdown"); } },
    });
    const worker = new ProviderOperationWorker(dependencies, options);
    const shutdown = new AbortController();
    const running = worker.runOnce(shutdown.signal);
    await started;
    shutdown.abort(new Error("test shutdown during configuration"));
    release();
    const result = await running;
    assert.equal(calls.outcomes.length, 0);
    assert.equal(calls.dispatches, 0);
    assert.equal(result.needsAttention, 0);
  }
});

test("provider worker shutdown aborts dispatch without writing a stale outcome", async () => {
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const { calls, dependencies } = harness({
    async dispatch({ signal }) {
      calls.dispatches++;
      markStarted();
      return await new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new Error("aborted"));
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  });
  const worker = new ProviderOperationWorker(dependencies, options);
  const shutdown = new AbortController();
  const running = worker.runOnce(shutdown.signal);
  await started;
  shutdown.abort(new Error("test shutdown"));
  const result = await running;
  assert.equal(calls.dispatches, 1);
  assert.equal(calls.outcomes.length, 0);
  assert.equal(result.succeeded, 0);
  assert.equal(result.retried, 0);
});


test("provider worker bounds shutdown when a lease renewal never settles", async () => {
  let renewals = 0;
  let heartbeat;
  let markRenewalStarted;
  const renewalStarted = new Promise(resolve => { markRenewalStarted = resolve; });
  const { calls, dependencies } = harness({
    repository: {
      async recoverExpiredLeases() { return []; },
      async claimNext() { return calls.claims++ === 0 ? operation : null; },
      async renewLease() { renewals++; markRenewalStarted(); return await new Promise(() => {}); },
      async recordOutcome(input) { calls.outcomes.push(input); return operation; },
    },
    scheduleHeartbeat(callback) { heartbeat = callback; return () => {}; },
    async dispatch() {
      heartbeat();
      await renewalStarted;
      return { providerReference: "must-not-persist" };
    },
  });
  const worker = new ProviderOperationWorker(dependencies, {
    ...options, renewalDrainTimeoutMs: 10,
  });
  const result = await worker.runOnce();
  assert.equal(renewals, 1, "exactly one heartbeat renewal must be active");
  assert.equal(result.leaseLost, 1);
  assert.equal(result.succeeded, 0);
  assert.equal(calls.outcomes.length, 0, "stale worker must not persist an outcome");
});
