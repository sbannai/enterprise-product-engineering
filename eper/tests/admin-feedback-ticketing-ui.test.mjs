import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createAppServer } from "../dist/apps/api/server.js";

test("admin wireframe exposes authenticated feedback and ticketing API mode", async () => {
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/wireframes`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    assert.match(html, /data-screen="support"/);
    assert.match(html, /id="screen-support"/);
    assert.match(html, /Feedback &amp; Ticketing|Feedback & Ticketing/);
    assert.match(html, /P1 discovery gate/);
    assert.match(html, /Authenticated API mode|authenticated API/i);
    assert.match(html, /server-side/i);
    assert.match(html, /supportApply/);
    assert.match(html, /supportClear/);
    assert.match(html, /id="supportConnect"/);
    assert.match(html, /id="supportBearer"/);
    assert.match(html, /admin\/support\/tickets/);
    assert.match(html, /supportBearerToken/);
    assert.match(html, /window.location.hash==="#support"/);
    assert.match(html, /params\.set\("type",type\)/);
    assert.match(html, /params\.set\("severity",severity\)/);
    assert.match(html, /params\.set\("status",status\)/);
    assert.match(html, /params\.set\("applicationId",app\)/);
    assert.match(html, /value="feature_request"/);
    assert.match(html, /value="p1_candidate"/);
    assert.match(html, /value="in_progress"/);
    assert.match(html, /token cleared from page memory|Token cleared from page memory/i);
    const scripts = html.split("<script>").slice(1).map((chunk) => chunk.split("</script>")[0]);
    assert.ok(scripts.length > 0, "wireframe should include its UI controller");
    for (const script of scripts) {
      assert.doesNotThrow(() => new vm.Script(script), "embedded UI JavaScript must parse");
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
