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
    const html = await response.text();
    for (const label of ["Help Center", "Growth Hub", "My Applications", "NOT SIGNED IN", "not connected yet"]) {
      assert.ok(html.includes(label), "missing customer portal content: " + label);
    }
    assert.match(html, /customer navigation/i);
    assert.doesNotMatch(html, /fetch\s*\(/, "customer preview must not make API calls");
    assert.doesNotMatch(html, /XMLHttpRequest|WebSocket/, "customer preview must remain disconnected");
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
      assert.deepEqual(await response.json(), { authenticated: false, error: "unauthorized" });
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
    assert.deepEqual(await response.json(), {
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
    assert.deepEqual(await response.json(), { modules: ["help-center", "growth-hub"] });
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
    assert.deepEqual(await help.json(), { module: "help-center", items: [{ title: "Getting started", body: "Setup guide" }] });
    const growth = await fetch(base + "growth-hub/content", { headers });
    assert.equal(growth.status, 403);
    assert.deepEqual(await growth.json(), { error: "module_not_enabled" });
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
    const payload = await response.json();
    assert.equal(payload.items.length, 100);
    assert.deepEqual(payload.items[0], { title: "Safe article", body: "Visible text" });
    assert.equal("internalSecret" in payload.items[0], false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
