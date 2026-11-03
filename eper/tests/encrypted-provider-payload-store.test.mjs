import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryEncryptedProviderPayloadStore,
  ProviderPayloadStoreError,
} from "../dist/packages/integrations/encrypted-provider-payload-store.js";

const key = Buffer.alloc(32, 7);
const base = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  operationId: "operation-0001",
  capabilityKey: "email.send",
};
const payload = {
  to: ["synthetic@example.invalid"],
  subject: "Synthetic test",
  body: "No external delivery",
};

function store(allow = true) {
  const calls = [];
  const value = new InMemoryEncryptedProviderPayloadStore(key, {
    async authorize(scope) {
      calls.push(scope);
      return allow;
    },
  });
  return { value, calls };
}

test("stores encrypted payload and retrieves it only through an authorized exact scope", async () => {
  const { value, calls } = store();
  const reference = await value.put({ ...base, payload });
  assert.match(reference.reference, /^pp_[a-f0-9-]{36}$/);
  assert.match(reference.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(await value.get(reference), payload);
  assert.deepEqual(calls, [base]);
});

test("rejects cross-tenant, cross-application, cross-operation and capability substitution", async () => {
  const { value, calls } = store();
  const reference = await value.put({ ...base, payload });
  for (const patch of [
    { tenantId: "tenant-b" },
    { applicationId: "app-b" },
    { operationId: "operation-0002" },
    { capabilityKey: "sms.send" },
  ]) {
    await assert.rejects(
      () => value.get({ ...reference, ...patch }),
      error => error instanceof ProviderPayloadStoreError
        && error.code === "PROVIDER_PAYLOAD_SCOPE_MISMATCH",
    );
  }
  assert.equal(calls.length, 0, "scope mismatch must be rejected before authorization");
});

test("fails closed when the authorization service denies or fails", async () => {
  const denied = store(false);
  const reference = await denied.value.put({ ...base, payload });
  await assert.rejects(
    () => denied.value.get(reference),
    error => error instanceof ProviderPayloadStoreError
      && error.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
  );

  const unavailable = new InMemoryEncryptedProviderPayloadStore(key, {
    async authorize() { throw new Error("authorization unavailable"); },
  });
  const second = await unavailable.put({ ...base, payload });
  await assert.rejects(
    () => unavailable.get(second),
    error => error instanceof ProviderPayloadStoreError
      && error.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
  );
});

test("detects altered digest and refuses malformed key material", async () => {
  const { value } = store();
  const reference = await value.put({ ...base, payload });
  await assert.rejects(
    () => value.get({ ...reference, digest: "f".repeat(64) }),
    error => error instanceof ProviderPayloadStoreError
      && error.code === "PROVIDER_PAYLOAD_SCOPE_MISMATCH",
  );
  assert.throws(
    () => new InMemoryEncryptedProviderPayloadStore(Buffer.alloc(16), { async authorize() { return true; } }),
    error => error instanceof ProviderPayloadStoreError
      && error.code === "PROVIDER_PAYLOAD_KEY_INVALID",
  );
});

test("deletes only the exact scoped reference and returns false after deletion", async () => {
  const { value } = store();
  const reference = await value.put({ ...base, payload });
  assert.equal(await value.delete(reference), true);
  assert.equal(await value.delete(reference), false);
  await assert.rejects(
    () => value.get(reference),
    error => error instanceof ProviderPayloadStoreError
      && error.code === "PROVIDER_PAYLOAD_NOT_FOUND",
  );
});

test("rejects payload values that cannot be represented as JSON", async () => {
  const { value } = store();
  await assert.rejects(
    () => value.put({ ...base, payload: undefined }),
    error => error instanceof ProviderPayloadStoreError
      && error.code === "PROVIDER_PAYLOAD_SERIALIZATION_FAILED",
  );
});

test("requires authorization before deleting a payload", async () => {
  let permitted = true;
  const controlled = new InMemoryEncryptedProviderPayloadStore(key, {
    async authorize() { return permitted; },
  });
  const reference = await controlled.put({ ...base, payload });
  permitted = false;
  await assert.rejects(
    () => controlled.delete(reference),
    error => error instanceof ProviderPayloadStoreError
      && error.code === "PROVIDER_PAYLOAD_ACCESS_DENIED",
  );
  permitted = true;
  assert.deepEqual(await controlled.get(reference), payload);
  assert.equal(await controlled.delete(reference), true);
});
