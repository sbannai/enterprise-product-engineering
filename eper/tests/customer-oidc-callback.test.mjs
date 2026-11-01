import test from "node:test";
import assert from "node:assert/strict";
import { completeCustomerOidcBrowserLogin } from "../dist/packages/identity/customer-oidc-callback.js";
import { CUSTOMER_OIDC_STATE_COOKIE } from "../dist/packages/identity/customer-oidc-browser-flow.js";

const state = "s".repeat(43);
const cookieHeader = CUSTOMER_OIDC_STATE_COOKIE + "=" + state;
const binding = { issuer: "https://issuer.example.test", subject: "subject-1", tenantId: "tenant-1", actorId: "actor-1", status: "active", version: 1 };

function fixture(overrides = {}) {
  const calls = [];
  const store = {
    createLoginTransaction: async () => { calls.push("createTransaction"); },
    consumeLoginTransaction: async () => { calls.push("consume"); return { nonceHash: "x", pkceVerifierCiphertext: "x", issuer: binding.issuer, redirectUri: "https://app.example.test/callback" }; },
    resolveSubject: async () => { calls.push("resolveSubject"); return binding; },
    createSession: async (input) => { calls.push(["createSession", input]); return { sessionToken: "t".repeat(43), session: {} }; },
    ...overrides,
  };
  const client = {
    completeLogin: async () => { calls.push("completeLogin"); return { issuer: binding.issuer, subject: binding.subject }; },
  };
  return { calls, store, client };
}

test("browser state mismatch is rejected before OIDC transaction consumption or code exchange", async () => {
  const f = fixture();
  await assert.rejects(() => completeCustomerOidcBrowserLogin({
    client: f.client, store: f.store, cookieHeader: undefined, code: "auth-code",
    state, correlationId: "request-1",
  }), { message: "EPER_OIDC_BROWSER_STATE_MISMATCH" });
  assert.deepEqual(f.calls, []);
});

test("callback requires an active explicit subject binding before session issuance", async () => {
  const f = fixture({ resolveSubject: async () => { f.calls.push("resolveSubject"); return { ...binding, status: "revoked" }; } });
  await assert.rejects(() => completeCustomerOidcBrowserLogin({
    client: f.client, store: f.store, cookieHeader, code: "auth-code",
    state, correlationId: "request-1",
  }), { message: "EPER_CUSTOMER_SUBJECT_BINDING_INACTIVE" });
  assert.deepEqual(f.calls, ["completeLogin", "resolveSubject"]);
});

test("callback issues a bounded durable session only after browser and subject checks", async () => {
  const f = fixture();
  const now = new Date("2026-11-01T09:00:00.000Z");
  const result = await completeCustomerOidcBrowserLogin({
    client: f.client, store: f.store, cookieHeader, code: "auth-code",
    state, correlationId: "request-1", now: () => now,
  });
  assert.deepEqual(f.calls.map((call) => Array.isArray(call) ? call[0] : call),
    ["completeLogin", "resolveSubject", "createSession"]);
  assert.deepEqual(result, {
    sessionToken: "t".repeat(43), tenantId: "tenant-1", actorId: "actor-1",
    issuer: binding.issuer, subject: binding.subject,
  });
  const create = f.calls[2][1];
  assert.equal(create.idleExpiresAt.toISOString(), "2026-11-01T09:30:00.000Z");
  assert.equal(create.absoluteExpiresAt.toISOString(), "2026-11-01T17:00:00.000Z");
  assert.equal(create.correlationId, "request-1");
});

test("callback propagates transactional binding revocation at session creation", async () => {
  const f = fixture({ createSession: async () => { f.calls.push("createSession"); throw new Error("EPER_CUSTOMER_SUBJECT_BINDING_INACTIVE"); } });
  await assert.rejects(() => completeCustomerOidcBrowserLogin({
    client: f.client, store: f.store, cookieHeader, code: "auth-code",
    state, correlationId: "request-1",
  }), { message: "EPER_CUSTOMER_SUBJECT_BINDING_INACTIVE" });
  assert.deepEqual(f.calls, ["completeLogin", "resolveSubject", "createSession"]);
});

test("callback rejects unsafe session lifetime configuration", async () => {
  const f = fixture();
  await assert.rejects(() => completeCustomerOidcBrowserLogin({
    client: f.client, store: f.store, cookieHeader, code: "auth-code",
    state, correlationId: "request-1", idleLifetimeMs: 60_000, absoluteLifetimeMs: 30_000,
  }), { message: "EPER_CUSTOMER_SESSION_LIFETIME_INVALID" });
  assert.deepEqual(f.calls, ["completeLogin", "resolveSubject"]);
});

test("replayed or expired one-time OIDC transaction cannot reach subject resolution", async () => {
  const f = fixture({
    completeLogin: async () => { f.calls.push("completeLogin"); throw new Error("EPER_OIDC_STATE_INVALID_OR_REPLAYED"); },
  });
  await assert.rejects(() => completeCustomerOidcBrowserLogin({
    client: f.client, store: f.store, cookieHeader, code: "auth-code",
    state, correlationId: "request-1",
  }), { message: "EPER_OIDC_STATE_INVALID_OR_REPLAYED" });
  assert.deepEqual(f.calls, ["completeLogin"]);
});

test("malformed authorization code is rejected without consuming transaction", async () => {
  const f = fixture();
  await assert.rejects(() => completeCustomerOidcBrowserLogin({
    client: f.client, store: f.store, cookieHeader, code: " ",
    state, correlationId: "request-1",
  }), { message: "EPER_OIDC_CALLBACK_INVALID" });
  assert.deepEqual(f.calls, []);
});
