import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("static wireframes POC is served without requiring API configuration", async () => {
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    const response = await fetch(base + "/wireframes");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    for (const label of ["Product overview", "Capability families", "Payment desk", "Receipt preview", "Workflow studio", "Roles & access", "Reports & audit", "Business UAT readiness"]) {
      assert.ok(html.includes(label), "missing wireframe: " + label);
    }
    assert.match(html, /Static wireframe POC — no API integration/);
    assert.match(html, /No payment is processed/);
    assert.match(html, /data-screen="payments"/);
    assert.match(html, /addEventListener/);
    assert.doesNotMatch(html, /fetch\s*\(/, "wireframes must not call APIs");
    assert.doesNotMatch(html, /XMLHttpRequest|WebSocket/, "wireframes must remain disconnected");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
