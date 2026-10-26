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
    assert.match(html, /Authenticated API mode/);
    assert.match(html, /supportConnect/);
    assert.match(html, /no payment is processed/i);
    assert.match(html, /data-screen="payments"/);
    // Responsive contract for the actual admin workspace markup.
    assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/i);
    assert.match(html, /@media\s*\(max-width:\s*980px\)/i, "tablet navigation breakpoint is required");
    assert.match(html, /@media\s*\(max-width:\s*600px\)/i, "mobile layout breakpoint is required");
    assert.match(html, /\.app\{display:block\}/i, "mobile shell must collapse to one column");
    assert.match(html, /overflow:auto/i, "mobile navigation or table overflow must be contained");
    assert.match(html, /addEventListener/);
    assert.match(html, /fetch\s*\(/, "support queue calls the protected API only after explicit token entry");
    assert.doesNotMatch(html, /XMLHttpRequest|WebSocket/, "wireframes must not use unapproved transport APIs");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
