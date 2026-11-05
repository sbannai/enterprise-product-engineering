import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderRuntimeCredentialError,
  ProviderRuntimeCredentialResolver,
} from "../dist/packages/integrations/provider-runtime-credential-resolver.js";

const selection = {
  tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
  capabilityKey: "email.send", connectionVersion: 7,
};

test("runtime credential resolver scopes lookup and returns transient secret material", async () => {
  const calls = [];
  const resolver = new ProviderRuntimeCredentialResolver({
    async getDispatchSecretReference(input) {
      calls.push({ type: "reference", input });
      return "vault://tenant-a/connection-a";
    },
    async assertDispatchAuthorization(input) {
      calls.push({ type: "authorization", input });
    },
  }, {
    async resolve(reference) {
      calls.push({ type: "resolve", reference });
      return { token: "synthetic-secret" };
    },
  });
  const credentials = await resolver.resolve(selection);
  assert.deepEqual(credentials, { token: "synthetic-secret" });
  assert.deepEqual(calls[0], { type: "reference", input: selection });
  assert.equal(calls[1].reference, "vault://tenant-a/connection-a");
  assert.deepEqual(calls[2], { type: "authorization", input: selection });
});

test("runtime credential resolver maps secret-manager exceptions to a safe code", async () => {
  const resolver = new ProviderRuntimeCredentialResolver({
    async getDispatchSecretReference() { return "vault://opaque"; },
    async assertDispatchAuthorization() {},
  }, {
    async resolve() { throw new Error("token=do-not-leak"); },
  });
  await assert.rejects(() => resolver.resolve(selection), error =>
    error instanceof ProviderRuntimeCredentialError
    && error.code === "PROVIDER_RUNTIME_CREDENTIAL_RESOLUTION_FAILED"
    && !error.message.includes("do-not-leak"));
});

test("runtime credential resolver fails closed when scoped reference is unavailable", async () => {
  let secretManagerCalled = false;
  const resolver = new ProviderRuntimeCredentialResolver({
    async getDispatchSecretReference() { throw new Error("not authorized"); },
    async assertDispatchAuthorization() {},
  }, {
    async resolve() { secretManagerCalled = true; return { token: "secret" }; },
  });
  await assert.rejects(() => resolver.resolve(selection), error =>
    error.code === "PROVIDER_RUNTIME_CREDENTIAL_REFERENCE_UNAVAILABLE");
  assert.equal(secretManagerCalled, false);
});

test("runtime credential resolver rejects incomplete scope before secret lookup", async () => {
  let referenceCalled = false;
  const resolver = new ProviderRuntimeCredentialResolver({
    async getDispatchSecretReference() { referenceCalled = true; return "vault://opaque"; },
    async assertDispatchAuthorization() {},
  }, { async resolve() { return { token: "secret" }; } });
  await assert.rejects(() => resolver.resolve({ ...selection, connectionVersion: 0 }), error =>
    error.code === "PROVIDER_RUNTIME_CREDENTIAL_SCOPE_INVALID");
  assert.equal(referenceCalled, false);
});

test("runtime credential resolver rechecks authorization after secret retrieval", async () => {
  let authorizationChecked = false;
  let credentialsResolved = false;
  const resolver = new ProviderRuntimeCredentialResolver({
    async getDispatchSecretReference() { return "vault://opaque"; },
    async assertDispatchAuthorization() {
      authorizationChecked = true;
      throw new Error("PROVIDER_DISPATCH_AUTHORIZATION_CHANGED");
    },
  }, {
    async resolve() {
      credentialsResolved = true;
      return { token: "synthetic-secret" };
    },
  });
  await assert.rejects(() => resolver.resolve(selection), error =>
    error.code === "PROVIDER_RUNTIME_CREDENTIAL_AUTHORIZATION_CHANGED");
  assert.equal(credentialsResolved, true);
  assert.equal(authorizationChecked, true);
});
