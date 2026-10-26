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
