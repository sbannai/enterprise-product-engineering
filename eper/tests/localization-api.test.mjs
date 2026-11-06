import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "localization-test-token-long-enough-to-pass-32-chars";

test("localization API exposes options and allows authenticated language/currency switching", async () => {
  const keys = [
    "EPER_LOCALIZATION_API_ENABLED", "EPER_LOCALIZATION_API_TOKEN",
    "EPER_LOCALIZATION_TENANT_ID", "EPER_LOCALIZATION_PRINCIPAL_ID",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_LOCALIZATION_API_ENABLED: "true",
    EPER_LOCALIZATION_API_TOKEN: TOKEN,
    EPER_LOCALIZATION_TENANT_ID: "tenant-localization-test",
    EPER_LOCALIZATION_PRINCIPAL_ID: "user-localization-test",
  });

  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const optionsResponse = await fetch(`${base}/localization/options`);
    assert.equal(optionsResponse.status, 200);
    const options = await optionsResponse.json();
    assert.ok(options.locales.some((item) => item.code === "te-IN"));
    assert.ok(options.currencies.some((item) => item.code === "USD"));

    const unauthorized = await fetch(`${base}/localization/preferences`);
    assert.equal(unauthorized.status, 401);

    const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
    const update = await fetch(`${base}/localization/preferences`, {
      method: "PUT", headers,
      body: JSON.stringify({ locale: "te-IN", currency: "USD", timeZone: "Asia/Dubai" }),
    });
    assert.equal(update.status, 200);
    assert.deepEqual((await update.json()).preference, {
      locale: "te-IN", currency: "USD", timeZone: "Asia/Dubai",
    });

    const read = await fetch(`${base}/localization/preferences`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(read.status, 200);
    assert.deepEqual((await read.json()).preference, {
      locale: "te-IN", currency: "USD", timeZone: "Asia/Dubai",
    });

    const invalid = await fetch(`${base}/localization/preferences`, {
      method: "PUT", headers, body: JSON.stringify({ locale: "xx-XX" }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
