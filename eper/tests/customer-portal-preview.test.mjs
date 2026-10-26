import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("customer portal preview has customer navigation separate from admin wireframes", async () => {
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    const response = await fetch(base + "/customer-portal-preview");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'self'/, "same-origin API access must be explicitly allowed by CSP");
    const html = await response.text();
    for (const label of ["Help Center", "Growth Hub", "My Applications", "NOT CONNECTED", "customerCredential", "Connect workspace", "/customer/session", "/customer/portal/context", "/customer/workspace/modules", "/customer/help-center/content", "/customer/growth-hub/content"]) {
      assert.ok(html.includes(label), "missing customer portal content: " + label);
    }
    assert.match(html, /customer navigation/i);
    // Responsive contract: narrow phones, touch-sized controls, keyboard focus, and
    // contained horizontal navigation must remain part of the served customer preview.
    assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/i);
    assert.match(html, /@media\s*\(max-width:\s*700px\)/i, "tablet/mobile layout breakpoint is required");
    assert.match(html, /@media\s*\(max-width:\s*380px\)/i, "narrow-phone layout breakpoint is required");
    assert.match(html, /nav button[^}]*min-height:\s*44px/i, "navigation targets must be touch-friendly");
    assert.match(html, /:focus-visible/i, "keyboard focus must be visible");
    assert.match(html, /authorization:\s*"Bearer "\s*\+\s*bearerToken/i, "API calls must carry the in-memory customer credential");
    assert.match(html, /cache:\s*"no-store"/i, "customer API responses must not be cached");
    assert.match(html, /overflow-x:\s*auto/i, "mobile navigation overflow must be contained");
    assert.match(html, /\.top\{flex-wrap:\s*wrap/i, "top bar must wrap instead of overflowing on narrow screens");
    assert.match(html, /\.cards\{grid-template-columns:minmax\(0,1fr\)\}/i, "cards must stack on mobile");
    const adminResponse = await fetch(base + "/wireframes");
    assert.equal(adminResponse.status, 200);
    const adminHtml = await adminResponse.text();
    assert.match(adminHtml, /Admin preview/);
    assert.doesNotMatch(adminHtml, /data-screen="help-center"/);
    assert.doesNotMatch(adminHtml, /data-screen="growth-hub"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("customer session endpoint rejects missing and unknown credentials", async () => {
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    for (const headers of [{}, { authorization: "Bearer unknown-credential" }]) {
      const response = await fetch(base + "/customer/session", { headers });
      assert.equal(response.status, 401);
      assert.deepEqual((await response.json()).error, { code: "UNAUTHENTICATED", message: "Authentication is required." });
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("customer session endpoint returns only server-mapped identity", async () => {
  const previous = process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
  const credential = "customer-test-credential-that-is-long-enough-123456";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-test", actorId: "actor-test", roleKey: "customer" }
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/session", {
      headers: { authorization: "Bearer " + credential }
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, {
      authenticated: true, tenantId: "tenant-test", actorId: "actor-test", roleKey: "customer"
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
    else process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = previous;
  }
});

test("customer workspace modules require identity and stay tenant-scoped", async () => {
  const previousIdentity = process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
  const previousModules = process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
  const credential = "workspace-module-test-credential-12345678901234567890";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" }
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({
    "tenant-a": ["help-center", "growth-hub", "admin-config", "growth-hub"],
    "tenant-b": ["settings"]
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port + "/customer/workspace/modules";
    const denied = await fetch(base);
    assert.equal(denied.status, 401);
    const response = await fetch(base, { headers: { authorization: "Bearer " + credential } });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { modules: ["help-center", "growth-hub"] });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousIdentity === undefined) delete process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
    else process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = previousIdentity;
    if (previousModules === undefined) delete process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
    else process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = previousModules;
  }
});

test("customer help and growth content APIs enforce module entitlement and tenant scope", async () => {
  const keys = ["EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_HELP_CONTENT_JSON", "EPER_CUSTOMER_GROWTH_CONTENT_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const credential = "content-api-test-credential-12345678901234567890";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({ [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" } });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["help-center"], "tenant-b": ["growth-hub"] });
  process.env.EPER_CUSTOMER_HELP_CONTENT_JSON = JSON.stringify({ "tenant-a": [{ title: "Getting started", body: "Setup guide" }], "tenant-b": [{ title: "Other tenant", body: "Must not leak" }] });
  process.env.EPER_CUSTOMER_GROWTH_CONTENT_JSON = JSON.stringify({ "tenant-a": [{ title: "Campaign", body: "Plan content" }] });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port + "/customer/";
    const denied = await fetch(base + "help-center/content"); assert.equal(denied.status, 401);
    const headers = { authorization: "Bearer " + credential };
    const help = await fetch(base + "help-center/content", { headers });
    assert.equal(help.status, 200);
    assert.deepEqual((await help.json()).data, { module: "help-center", items: [{ title: "Getting started", body: "Setup guide" }] });
    const growth = await fetch(base + "growth-hub/content", { headers });
    assert.equal(growth.status, 403);
    assert.deepEqual((await growth.json()).error, { code: "FORBIDDEN", message: "This customer module is not enabled." });
    assert.equal(help.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("customer content APIs expose only bounded title/body fields", async () => {
  const keys = ["EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON", "EPER_CUSTOMER_HELP_CONTENT_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const credential = "bounded-content-test-credential-12345678901234567890";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({ [credential]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer" } });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-b": ["help-center"] });
  process.env.EPER_CUSTOMER_HELP_CONTENT_JSON = JSON.stringify({
    "tenant-b": [
      { title: "Safe article", body: "Visible text", internalSecret: "must not leak" },
      { title: 42, body: "invalid title" },
      ...Array.from({ length: 105 }, (_, index) => ({ title: "Article " + index, body: "Body " + index }))
    ]
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/help-center/content", { headers: { authorization: "Bearer " + credential } });
    assert.equal(response.status, 200);
    const payload = (await response.json()).data;
    assert.equal(payload.items.length, 100);
    assert.deepEqual(payload.items[0], { title: "Safe article", body: "Visible text" });
    assert.equal("internalSecret" in payload.items[0], false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("customer portal context exposes only tenant-enabled navigation modules", async () => {
  const keys = ["EPER_CUSTOMER_PORTAL_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const credential = "portal-context-test-credential-12345678901234567890";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({
    "tenant-a": ["help-center", "tickets-feedback", "admin-config", "help-center"],
    "tenant-b": ["growth-hub", "settings"],
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/portal/context", {
      headers: { authorization: "Bearer " + credential },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.navigation.map((item) => item.key), ["home", "help-center", "tickets-feedback"]);
    assert.equal(payload.navigation.some((item) => item.key === "growth-hub"), false);
    assert.equal(payload.navigation.some((item) => item.key === "settings"), false);
    assert.equal(payload.note.includes("enforce authorization independently"), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("customer portal context fails closed to Home when tenant module configuration is absent", async () => {
  const keys = ["EPER_CUSTOMER_PORTAL_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const credential = "portal-context-empty-config-credential-1234567890";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [credential]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  delete process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/portal/context", {
      headers: { authorization: "Bearer " + credential },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.navigation.map((item) => item.key), ["home"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
