import assert from "node:assert/strict";
import test from "node:test";
import {
  PeripheralAdapterRegistry, assertPeripheralConfiguredForActivation,
  assertPeripheralScope, transitionPeripheral,
} from "../dist/packages/peripherals/index.js";

const adapter = {
  async connect() {}, async disconnect() {},
  async invoke() { return { outcome: "SUCCEEDED" }; },
};

test("package and adapter registry do not connect until explicit activation is handled by lifecycle", () => {
  let connections = 0;
  const lazyAdapter = { ...adapter, async connect() { connections++; } };
  const registry = new PeripheralAdapterRegistry([{
    adapterKey: "synthetic.local", adapterVersion: "1.0.0",
    kinds: ["barcode_scanner"], adapter: lazyAdapter,
  }]);
  assert.equal(connections, 0);
  registry.resolve({ adapterKey: "synthetic.local", adapterVersion: "1.0.0", kind: "barcode_scanner" });
  assert.equal(connections, 0);
});

test("adapter resolution requires exact key and version and declared peripheral kind", () => {
  const registry = new PeripheralAdapterRegistry([{
    adapterKey: "synthetic.local", adapterVersion: "1.0.0",
    kinds: ["barcode_scanner"], adapter,
  }]);
  assert.equal(registry.resolve({ adapterKey: "synthetic.local", adapterVersion: "1.0.0", kind: "barcode_scanner" }), adapter);
  assert.throws(() => registry.resolve({ adapterKey: "synthetic.local", adapterVersion: "2.0.0", kind: "barcode_scanner" }), /PERIPHERAL_ADAPTER_NOT_REGISTERED/);
  assert.throws(() => registry.resolve({ adapterKey: "synthetic.local", adapterVersion: "1.0.0", kind: "printer" }), /PERIPHERAL_ADAPTER_KIND_UNSUPPORTED/);
});

test("rejects duplicate adapter registrations and malformed definitions", () => {
  const registration = { adapterKey: "synthetic.local", adapterVersion: "1.0.0", kinds: ["barcode_scanner"], adapter };
  assert.throws(() => new PeripheralAdapterRegistry([registration, registration]), /PERIPHERAL_ADAPTER_DUPLICATE/);
  assert.throws(() => new PeripheralAdapterRegistry([{ ...registration, adapterVersion: "latest" }]), /PERIPHERAL_ADAPTER_REGISTRATION_INVALID/);
});

test("application scope cannot cross tenant or application boundaries", () => {
  assertPeripheralScope({ tenantId: "t1", applicationId: "a1" }, { tenantId: "t1", applicationId: "a1" });
  assert.throws(() => assertPeripheralScope({ tenantId: "t1", applicationId: "a1" }, { tenantId: "t1", applicationId: "a2" }), /PERIPHERAL_APPLICATION_SCOPE_MISMATCH/);
  assert.throws(() => assertPeripheralScope({ tenantId: "t1", applicationId: "a1" }, { tenantId: "t2", applicationId: "a1" }), /PERIPHERAL_APPLICATION_SCOPE_MISMATCH/);
});

test("activation requires a complete matching explicit configuration", () => {
  const config = { adapterKey: "synthetic.local", adapterVersion: "1.0.0", settings: {} };
  assertPeripheralConfiguredForActivation({ status: "CONFIGURED", adapterKey: "synthetic.local", adapterVersion: "1.0.0", configuration: config });
  assert.throws(() => assertPeripheralConfiguredForActivation({ status: "REGISTERED", adapterKey: null, adapterVersion: null, configuration: null }), /PERIPHERAL_CONFIGURATION_REQUIRED_FOR_ACTIVATION/);
  assert.throws(() => assertPeripheralConfiguredForActivation({ status: "CONFIGURED", adapterKey: "synthetic.local", adapterVersion: "1.0.0", configuration: { ...config, adapterVersion: "2.0.0" } }), /PERIPHERAL_CONFIGURATION_REQUIRED_FOR_ACTIVATION/);
});

test("lifecycle rejects skipping configuration and retired peripherals never reactivate", () => {
  assert.equal(transitionPeripheral("DRAFT", "REGISTERED"), "REGISTERED");
  assert.equal(transitionPeripheral("REGISTERED", "CONFIGURED"), "CONFIGURED");
  assert.equal(transitionPeripheral("CONFIGURED", "ACTIVE"), "ACTIVE");
  assert.throws(() => transitionPeripheral("REGISTERED", "ACTIVE"), /PERIPHERAL_INVALID_STATE_TRANSITION/);
  assert.throws(() => transitionPeripheral("RETIRED", "ACTIVE"), /PERIPHERAL_INVALID_STATE_TRANSITION/);
});


test("adapter without an explicit dependency ID list is not treated as dependency-free", () => {
  const registry = new PeripheralAdapterRegistry([{
    adapterKey: "vendor.scanner", adapterVersion: "1.0.0",
    kinds: ["barcode_scanner"], adapter,
  }]);
  assert.equal(registry.dependencyIds({
    adapterKey: "vendor.scanner", adapterVersion: "1.0.0", kind: "barcode_scanner",
  }), undefined);
});

test("legacy in-memory dependency snapshots cannot substitute for persisted dependency IDs", () => {
  const registry = new PeripheralAdapterRegistry([{
    adapterKey: "vendor.scanner", adapterVersion: "1.0.0",
    kinds: ["barcode_scanner"], adapter,
  }]);
  assert.equal(registry.dependencyIds({
    adapterKey: "vendor.scanner", adapterVersion: "1.0.0", kind: "barcode_scanner",
  }), undefined);
});
