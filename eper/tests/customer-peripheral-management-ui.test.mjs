import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("peripheral management UI is hidden when the optional capability is disabled", async () => {
  const previous = process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
  delete process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/peripherals/ui");
    assert.equal(response.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
    else process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED = previous;
  }
});

test("peripheral management UI is served behind the explicit capability flag with restrictive headers", async () => {
  const previous = process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
  process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED = "true";
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/peripherals/ui");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy") || "", /default-src 'none'/);
    const html = await response.text();
    assert.match(html, /Peripheral Management/);
    assert.match(html, /Save configuration/);
    assert.match(html, /explicitly activate/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
    else process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED = previous;
  }
});
