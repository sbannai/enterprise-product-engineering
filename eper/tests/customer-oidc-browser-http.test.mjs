import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";
import { createCustomerCsrfToken } from "../dist/packages/identity/customer-browser-security.js";

const secret = "c".repeat(48);
const state = "s".repeat(43);
const sessionToken = "t".repeat(43);
const origin = "https://customer.example.test";
const keys = ["EPER_CUSTOMER_OIDC_ENABLED"];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));

async function withServer(run) {
  process.env.EPER_CUSTOMER_OIDC_ENABLED = "true";
  const calls = [];
  const store = {
    async createLoginTransaction() { calls.push("createLoginTransaction"); },
    async consumeLoginTransaction() { calls.push("consumeLoginTransaction"); return { nonceHash: "x", pkceVerifierCiphertext: "x", issuer: "https://idp.example.test", redirectUri: origin + "/customer/auth/oidc/callback" }; },
    async resolveSubject(issuer, subject) { calls.push("resolveSubject"); return { issuer, subject, tenantId: "tenant-01", actorId: "actor-01", status: "active", version: 1 }; },
    async createSession() { calls.push("createSession"); return { sessionToken, session: {} }; },
    async revokeSession(token, reason) { calls.push("revokeSession"); assert.equal(token, sessionToken); assert.equal(reason, "user_logout"); return true; },
  };
  const client = {
    async beginLogin() { calls.push("beginLogin"); return { authorizationUrl: "https://idp.example.test/authorize?state=" + state, state }; },
    async completeLogin() { calls.push("completeLogin"); return { issuer: "https://idp.example.test", subject: "subject-01" }; },
  };
  const server = createAppServer({ customerOidcClient: client, customerIdentitySessionStore: store,
    customerOidcPublicOrigin: origin, customerCsrfSecret: secret });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    await run("http://127.0.0.1:" + address.port, calls);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("OIDC start issues browser-bound state cookie and callback issues durable session cookies", async () => {
  await withServer(async (base, calls) => {
    const start = await fetch(base + "/customer/auth/oidc/start?returnTo=%2Fworkspace%3Ftab%3Dapplications", { redirect: "manual" });
    assert.equal(start.status, 302);
    assert.match(start.headers.get("location"), /^https:\/\/idp\.example\.test\/authorize/);
    const startCookies = start.headers.getSetCookie();
    const stateCookie = startCookies.find(value => value.startsWith("__Host-eper_oidc_state="));
    const returnCookie = startCookies.find(value => value.startsWith("__Host-eper_oidc_return="));
    assert.ok(stateCookie);
    assert.ok(returnCookie);
    assert.match(stateCookie, /HttpOnly/);
    assert.match(stateCookie, /Secure/);
    assert.match(stateCookie, /SameSite=Lax/);
    assert.match(returnCookie, /HttpOnly/);
    assert.match(returnCookie, /Secure/);
    assert.match(returnCookie, /SameSite=Lax/);
    const callback = await fetch(base + "/customer/auth/oidc/callback?code=auth-code&state=" + state, {
      redirect: "manual", headers: { cookie: stateCookie.split(";")[0] + "; " + returnCookie.split(";")[0] },
    });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/workspace?tab=applications");
    const cookies = callback.headers.getSetCookie();
    assert.ok(cookies.some(value => value.startsWith("__Host-eper_session=") && /HttpOnly/.test(value)));
    assert.ok(cookies.some(value => value.startsWith("__Host-eper_csrf=")));
    assert.ok(cookies.some(value => value.startsWith("__Host-eper_oidc_state=") && /Max-Age=0/.test(value)));
    assert.ok(cookies.some(value => value.startsWith("__Host-eper_oidc_return=") && /Max-Age=0/.test(value)));
    assert.deepEqual(calls, ["beginLogin", "completeLogin", "resolveSubject", "createSession"]);
  });
});

test("logout requires same-origin CSRF proof, revokes the session and clears cookies", async () => {
  await withServer(async (base, calls) => {
    const csrf = createCustomerCsrfToken(sessionToken, secret);
    const cookie = "__Host-eper_session=" + sessionToken + "; __Host-eper_csrf=" + csrf;
    const denied = await fetch(base + "/customer/auth/logout", { method: "POST", headers: { cookie } });
    assert.equal(denied.status, 403);
    const allowed = await fetch(base + "/customer/auth/logout", { method: "POST", headers: {
      cookie, origin, "x-csrf-token": csrf,
    } });
    assert.equal(allowed.status, 204);
    assert.ok(allowed.headers.getSetCookie().some(value => value.startsWith("__Host-eper_session=") && /Max-Age=0/.test(value)));
    assert.deepEqual(calls, ["revokeSession"]);
  });
});


test("OIDC HTTP callback never redirects to an external returnTo destination", async () => {
  await withServer(async (base) => {
    const start = await fetch(base + "/customer/auth/oidc/start?returnTo=" + encodeURIComponent("https://evil.example.test/phishing"), { redirect: "manual" });
    assert.equal(start.status, 302);
    const startCookies = start.headers.getSetCookie();
    const stateCookie = startCookies.find(value => value.startsWith("__Host-eper_oidc_state="));
    const returnCookie = startCookies.find(value => value.startsWith("__Host-eper_oidc_return="));
    assert.ok(stateCookie);
    assert.ok(returnCookie);
    const callback = await fetch(base + "/customer/auth/oidc/callback?code=auth-code&state=" + state, {
      redirect: "manual",
      headers: { cookie: stateCookie.split(";")[0] + "; " + returnCookie.split(";")[0] },
    });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/");
  });
});
