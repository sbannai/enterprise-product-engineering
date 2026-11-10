import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("application peripheral API is disabled by default", async () => {
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
    const response = await fetch(
      "http://127.0.0.1:" + address.port + "/customer/applications/application-a/peripherals",
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
    else process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED = previous;
  }
});

test("enabled peripheral API still fails closed without durable stores", async () => {
  const keys = [
    "EPER_APPLICATION_PERIPHERAL_API_ENABLED",
    "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
    "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      "http://127.0.0.1:" + address.port + "/customer/applications/application-a/peripherals",
    );
    assert.equal(response.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
