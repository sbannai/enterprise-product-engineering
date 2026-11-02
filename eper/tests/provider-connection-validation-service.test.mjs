import assert from "node:assert/strict";
import test from "node:test";
import { ProviderConnectionValidationService } from "../dist/packages/integrations/provider-connection-validation-service.js";

function fixture({ adapterResult = { ok: true }, secretError = null, adapterPresent = true } = {}) {
  const calls = [];
  const snapshot = {
    tenantId: "tenant-a", connectionId: "connection-a", providerKey: "mail",
    adapterKey: "mail-adapter", adapterVersion: "1.0.0", authMode: "oauth",
    secretReference: "vault://tenant-a/mail/credential", environment: "sandbox",
    safeMetadata: { region: "ap-south" }, status: "PENDING_VALIDATION", version: 4,
  };
  const store = {
    async getValidationSnapshot(tenantId, applicationId, connectionId) {
      calls.push({ op: "read", tenantId, applicationId, connectionId });
      return tenantId === snapshot.tenantId && applicationId === "app-a" && connectionId === snapshot.connectionId ? snapshot : null;
    },
    async recordValidationOutcome(input) {
      calls.push({ op: "persist", input });
      return { status: input.outcome === "SUCCEEDED" ? "ACTIVE" : "DEGRADED", version: 5 };
    },
  };
  const secrets = {
    async resolve(reference) {
      calls.push({ op: "secret", reference });
      if (secretError) throw secretError;
      return { accessToken: "never-return-this-secret" };
    },
  };
  const adapters = {
    get(key, version) {
      calls.push({ op: "adapter", key, version });
      if (!adapterPresent) return null;
      return {
        async validateCredentials(input) {
          calls.push({ op: "validate", input });
          return adapterResult;
        },
      };
    },
  };
  return {
    service: new ProviderConnectionValidationService(store, secrets, adapters),
    calls,
  };
}
const request = {
  tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a", actorId: "admin-a",
  correlationId: "corr-a", auditEnvironment: "sandbox",
};

test("successful sandbox validation activates the connection without returning credentials", async () => {
  const { service, calls } = fixture();
  const result = await service.validate(request);
  assert.deepEqual(result, {
    connectionId: "connection-a", outcome: "SUCCEEDED", status: "ACTIVE", version: 5,
  });
  assert.equal(JSON.stringify(result).includes("never-return-this-secret"), false);
  assert.equal(calls.find((call) => call.op === "persist").input.expectedVersion, 4);
});

test("failed provider validation degrades the connection with only a stable error code", async () => {
  const { service, calls } = fixture({ adapterResult: { ok: false, errorCode: "AUTH_REJECTED" } });
  const result = await service.validate(request);
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.errorCode, "AUTH_REJECTED");
  assert.equal(calls.find((call) => call.op === "persist").input.outcome, "FAILED");
});

test("secret-manager exception details are never returned or persisted", async () => {
  const { service, calls } = fixture({ secretError: new Error("token=top-secret-value") });
  const result = await service.validate(request);
  assert.equal(result.errorCode, "PROVIDER_CREDENTIAL_VALIDATION_UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("top-secret-value"), false);
  assert.equal(JSON.stringify(calls.find((call) => call.op === "persist").input).includes("top-secret-value"), false);
});

test("missing adapter fails closed and records a safe outcome", async () => {
  const { service, calls } = fixture({ adapterPresent: false });
  const result = await service.validate(request);
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.errorCode, "PROVIDER_ADAPTER_UNAVAILABLE");
  assert.equal(calls.some((call) => call.op === "secret"), false);
});

test("revoked or suspended connections are not sent to secret manager or provider", async () => {
  const { service, calls } = fixture();
  const original = service["store"].getValidationSnapshot;
  service["store"].getValidationSnapshot = async () => ({
    tenantId: "tenant-a", connectionId: "connection-a", providerKey: "mail",
    adapterKey: "mail-adapter", adapterVersion: "1.0.0", authMode: "oauth",
    secretReference: "vault://tenant-a/mail/credential", environment: "sandbox",
    safeMetadata: {}, status: "REVOKED", version: 4,
  });
  await assert.rejects(() => service.validate(request), /PROVIDER_CONNECTION_NOT_VALIDATABLE/);
  assert.equal(calls.some((call) => call.op === "secret"), false);
  service["store"].getValidationSnapshot = original;
});

test("unknown or unsafe provider error strings are replaced with a stable generic code", async () => {
  const { service } = fixture({ adapterResult: { ok: false, errorCode: "token=secret" } });
  const result = await service.validate(request);
  assert.equal(result.errorCode, "PROVIDER_VALIDATION_FAILED");
});


test("validation cannot read a tenant connection without a binding to the requested application", async () => {
  const { service, calls } = fixture();
  await assert.rejects(() => service.validate({ ...request, applicationId: "app-b" }), /PROVIDER_CONNECTION_NOT_FOUND/);
  assert.equal(calls.some((call) => call.op === "secret"), false);
  assert.equal(calls.some((call) => call.op === "validate"), false);
});
