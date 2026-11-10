import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationPeripheralService } from "../dist/packages/peripherals/application-peripheral-service.js";

const scope = {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "operator-1",
  environment: "sandbox", correlationId: "corr-1",
};
const registration = (overrides = {}) => ({
  ...scope, peripheralId: "peripheral-1", kind: "barcode_scanner",
  displayName: "Front desk scanner", adapterKey: "synthetic.local",
  adapterVersion: "1.0.0", status: "CONFIGURED",
  configurationVersion: 1, version: 7, ...overrides,
});
const configuration = {
  adapterKey: "synthetic.local", adapterVersion: "1.0.0", settings: { mode: "test" },
};

function fixture({ connect = async () => {}, disconnect = async () => {}, noRegistration = false, noConfiguration = false, failDegradedPersist = false, initialStatus = "CONFIGURED" } = {}) {
  const calls = [];
  let current = registration({ status: initialStatus });
  const config = configuration;
  const repository = {
    async register(input) { calls.push(["register", input]); return current; },
    async configure(input) { calls.push(["configure", input]); return current; },
    async get(input, id) { calls.push(["get", id]); return noRegistration ? null : current; },
    async getConfiguration(input, id) { calls.push(["getConfiguration", id]); return noConfiguration ? null : config; },
    async transition(input) {
      calls.push(["transition", input.nextStatus, input.expectedVersion]);
      if (failDegradedPersist && input.nextStatus === "DEGRADED") throw new Error("database unavailable");
      current = registration({
        status: input.nextStatus,
        version: current.version + 1,
      });
      return current;
    },
  };
  const adapter = {
    async connect(context, suppliedConfig, signal) {
      calls.push(["connect", context, suppliedConfig, signal.aborted]);
      await connect();
    },
    async disconnect(context) { calls.push(["disconnect", context]); await disconnect(); },
    async invoke() { return { outcome: "SUCCEEDED" }; },
  };
  const adapters = {
    resolve(input) {
      calls.push(["resolve", input]);
      if (input.adapterKey !== "synthetic.local" || input.adapterVersion !== "1.0.0") {
        throw new Error("wrong adapter");
      }
      return adapter;
    },
  };
  const capabilities = {
    async withPeripheralManagement(trustedScope, operation) {
      assert.equal(trustedScope.tenantId, scope.tenantId);
      assert.equal(trustedScope.applicationId, scope.applicationId);
      calls.push(["entitlement"]);
      return operation({ addonKey: "peripheral_management" });
    },
  };
  return { service: new ApplicationPeripheralService(capabilities, repository, adapters), calls };
}

test("registration is entitlement-gated and never connects an adapter", async () => {
  const { service, calls } = fixture();
  await service.register({ ...scope, kind: "barcode_scanner", displayName: "Front desk scanner" });
  assert.equal(calls[0][0], "entitlement");
  assert.equal(calls.some(call => call[0] === "connect"), false);
});

test("activation resolves exact configured adapter and connects only after durable ACTIVE transition", async () => {
  const { service, calls } = fixture();
  const result = await service.activate({ ...scope, peripheralId: "peripheral-1", expectedVersion: 7 });
  assert.equal(result.status, "ACTIVE");
  const transition = calls.findIndex(call => call[0] === "transition");
  const connect = calls.findIndex(call => call[0] === "connect");
  assert.ok(transition >= 0 && connect > transition);
  assert.deepEqual(calls.find(call => call[0] === "resolve")[1], {
    adapterKey: "synthetic.local", adapterVersion: "1.0.0", kind: "barcode_scanner",
  });
  assert.equal(calls[transition][2], 7);
});

test("failed adapter connection attempts to persist DEGRADED using the new row version", async () => {
  const { service, calls } = fixture({ connect: async () => { throw new Error("offline"); } });
  await assert.rejects(
    service.activate({ ...scope, peripheralId: "peripheral-1", expectedVersion: 7 }),
    /EPER_PERIPHERAL_ADAPTER_CONNECT_FAILED/,
  );
  const transitions = calls.filter(call => call[0] === "transition");
  assert.deepEqual(transitions.map(call => [call[1], call[2]]), [["ACTIVE", 7], ["DEGRADED", 8]]);
});

test("failed DEGRADED persistence is surfaced instead of hiding a stale ACTIVE state", async () => {
  const { service } = fixture({
    connect: async () => { throw new Error("adapter offline"); },
    failDegradedPersist: true,
  });
  await assert.rejects(
    service.activate({ ...scope, peripheralId: "peripheral-1", expectedVersion: 7 }),
    error => error instanceof AggregateError &&
      error.message === "EPER_PERIPHERAL_ADAPTER_CONNECT_AND_DEGRADED_STATE_PERSIST_FAILED" &&
      error.errors.length === 2,
  );
});

test("suspension persists the inactive state and disconnects the configured adapter", async () => {
  const { service, calls } = fixture({ initialStatus: "ACTIVE" });
  const result = await service.suspend({ ...scope, peripheralId: "peripheral-1", expectedVersion: 7 });
  assert.equal(result.status, "SUSPENDED");
  const transitions = calls.map((call, index) => ({ call, index })).filter(x => x.call[0] === "transition");
  const disconnect = calls.findIndex(call => call[0] === "disconnect");
  assert.deepEqual(transitions.map(x => [x.call[1], x.call[2]]), [["DISCONNECTING", 7], ["SUSPENDED", 8]]);
  assert.ok(disconnect > transitions[0].index && disconnect < transitions[1].index);
});

test("failed adapter disconnect remains visibly DISCONNECTING and is not reported as suspended", async () => {
  const { service, calls } = fixture({
    initialStatus: "ACTIVE",
    disconnect: async () => { throw new Error("device still connected"); },
  });
  await assert.rejects(
    service.suspend({ ...scope, peripheralId: "peripheral-1", expectedVersion: 7 }),
    /EPER_PERIPHERAL_ADAPTER_DISCONNECT_FAILED_RECONCILIATION_REQUIRED/,
  );
  const transitions = calls.filter(call => call[0] === "transition");
  assert.deepEqual(transitions.map(call => call[1]), ["DISCONNECTING"]);
});

test("missing registration and missing configuration fail closed without adapter resolution", async () => {
  const missingRegistration = fixture({ noRegistration: true });
  await assert.rejects(
    missingRegistration.service.activate({ ...scope, peripheralId: "peripheral-1", expectedVersion: 7 }),
    /EPER_PERIPHERAL_NOT_FOUND/,
  );
  assert.equal(missingRegistration.calls.some(call => call[0] === "resolve"), false);

  const missingConfiguration = fixture({ noConfiguration: true });
  await assert.rejects(
    missingConfiguration.service.activate({ ...scope, peripheralId: "peripheral-1", expectedVersion: 7 }),
    /EPER_PERIPHERAL_CONFIGURATION_REQUIRED/,
  );
  assert.equal(missingConfiguration.calls.some(call => call[0] === "resolve"), false);
});
