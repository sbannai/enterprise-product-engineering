import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPeripheralCatalogueDatabaseIdentity,
} from "../dist/packages/peripherals/peripheral-catalogue-database-identity.js";

const primary = {
  database_name: "eper",
  server_address: "10.0.0.10",
  server_port: 5432,
  is_replica: false,
};

function poolWith(identity) {
  const state = { acquired: 0, released: 0 };
  return {
    state,
    async connect() {
      state.acquired += 1;
      return {
        async query() {
          return { rows: identity ? [identity] : [], rowCount: identity ? 1 : 0 };
        },
        release() {
          state.released += 1;
        },
      };
    },
  };
}

test("accepts application, payment, catalogue admin and read pools on the same primary database", async () => {
  const application = poolWith(primary);
  const payment = poolWith(primary);
  const admin = poolWith(primary);
  const read = poolWith(primary);

  await assert.doesNotReject(() =>
    assertPeripheralCatalogueDatabaseIdentity({ application, payment, admin, read }),
  );

  for (const pool of [application, payment, admin, read]) {
    assert.equal(pool.state.acquired, 1);
    assert.equal(pool.state.released, 1);
  }
});

test("rejects a payment pool connected to a different database", async () => {
  const application = poolWith(primary);
  const payment = poolWith({ ...primary, database_name: "eper_payment" });
  const read = poolWith(primary);

  await assert.rejects(
    () => assertPeripheralCatalogueDatabaseIdentity({ application, payment, read }),
    /EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_MISMATCH_PAYMENT/,
  );

  for (const pool of [application, payment, read]) {
    assert.equal(pool.state.acquired, 1);
    assert.equal(pool.state.released, 1);
  }
});

test("accepts the same application primary when catalogue administration is disabled", async () => {
  const application = poolWith(primary);
  const payment = poolWith(primary);
  const read = poolWith(primary);

  await assert.doesNotReject(() =>
    assertPeripheralCatalogueDatabaseIdentity({ application, payment, read }),
  );

  for (const pool of [application, payment, read]) {
    assert.equal(pool.state.acquired, 1);
    assert.equal(pool.state.released, 1);
  }
});

test("rejects a different database name", async () => {
  const application = poolWith(primary);
  const payment = poolWith(primary);
  const read = poolWith({ ...primary, database_name: "eper_other" });

  await assert.rejects(
    () => assertPeripheralCatalogueDatabaseIdentity({ application, payment, read }),
    /EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_MISMATCH_READ/,
  );

  for (const pool of [application, payment, read]) {
    assert.equal(pool.state.acquired, 1);
    assert.equal(pool.state.released, 1);
  }
});

test("rejects a different PostgreSQL server endpoint", async () => {
  const application = poolWith(primary);
  const payment = poolWith(primary);
  const read = poolWith({ ...primary, server_address: "10.0.0.11" });

  await assert.rejects(
    () => assertPeripheralCatalogueDatabaseIdentity({ application, payment, read }),
    /EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_MISMATCH_READ/,
  );

  for (const pool of [application, payment, read]) {
    assert.equal(pool.state.acquired, 1);
    assert.equal(pool.state.released, 1);
  }
});

test("rejects replicas and unverifiable database identities", async () => {
  const application = poolWith(primary);
  const payment = poolWith(primary);
  const replica = poolWith({ ...primary, is_replica: true });

  await assert.rejects(
    () => assertPeripheralCatalogueDatabaseIdentity({ application, payment, read: replica }),
    /EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_UNVERIFIABLE/,
  );

  for (const pool of [application, payment, replica]) {
    assert.equal(pool.state.acquired, 1);
    assert.equal(pool.state.released, 1);
  }

  const missingAddress = poolWith({ ...primary, server_address: null });
  await assert.rejects(
    () => assertPeripheralCatalogueDatabaseIdentity({ application, payment, read: missingAddress }),
    /EPER_PERIPHERAL_CATALOGUE_DATABASE_IDENTITY_UNVERIFIABLE/,
  );

  for (const pool of [application, payment]) {
    assert.equal(pool.state.acquired, 2);
    assert.equal(pool.state.released, 2);
  }
  assert.equal(missingAddress.state.acquired, 1);
  assert.equal(missingAddress.state.released, 1);
  assert.equal(replica.state.acquired, 1);
  assert.equal(replica.state.released, 1);
});
