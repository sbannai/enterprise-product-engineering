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
    assert.match(html, /function customerErrorMessage\(error\)/, "customer UI must map internal API failures to safe user-facing messages");
    assert.ok(html.includes("eper-toast-region"), "customer portal includes the rendered shared toast center");
    assert.ok(html.includes("window.EPERToast"), "customer portal wires notifications to the shared toast API");
    assert.ok(html.includes("var recent=new Map()"), "shared toast center tracks recent notifications to avoid duplicates");
    assert.ok(html.includes("now-previous.at<1800"), "identical toast notifications are deduplicated in a short burst");
    assert.ok(html.includes("Ticket submitted"), "ticket submission success is surfaced to the customer");
    assert.ok(html.includes("Submission needs retry"), "uncertain ticket submissions surface a warning notification");
    assert.ok(html.includes("Ticket history unavailable"), "ticket history failures trigger a toast");
    assert.ok(html.includes("Assets unavailable"), "asset loading failures trigger a toast");
    assert.ok(html.includes("Settings partially unavailable"), "partial settings failures trigger a warning toast");
    assert.match(html, /Submission outcome may be unknown\. Retry the original request unchanged/, "ticket retry messaging must preserve idempotency without exposing internal errors");
    assert.match(html, /Download unavailable\. Check your access or try again shortly\./, "download errors must not expose internal provider or storage details");
    for (const label of ["Help Center", "Growth Hub", "My Applications", "Client Assets", "/customer/assets", "loadAllClientAssets", "all=true", "NOT CONNECTED", "Sign in with your organization", "Sign out", "/customer/auth/oidc/start", "/customer/session", "/customer/portal/context", "/customer/workspace/modules", "/customer/help-center/content", "/customer/growth-hub/content", "data-download-application", "data-download-asset", "Requesting secure download", "downloadUrl", "Allow pop-ups"]) {
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
    assert.match(html, /credentials:"same-origin"/i, "customer APIs must use the browser session cookie");
    assert.match(html, /headers\["x-csrf-token"\]=csrf/i, "unsafe customer API requests must carry the same-origin CSRF token");
    assert.match(html, /const session=await api\("\/customer\/session"\)/, "workspace bootstrap must resolve the browser session before loading customer data");
    assert.match(html, /Promise\.all\(\[api\("\/customer\/portal\/context"\),api\("\/customer\/workspace\/modules"\)\]\)/, "workspace context and module requests must run concurrently after authentication");
    assert.match(html, /cache:\s*"no-store"/i, "customer API responses must not be cached");
    assert.match(html, /\/customer\/applications\/\"\+encodeURIComponent\(applicationId\)\+\"\/assets\//, "asset downloads must use the authenticated application-scoped download API");
    assert.match(html, /window\.open\("about:blank"/, "download UI must open the destination only after an explicit user click");
    assert.ok(html.includes("Tickets for selected application"), "customer ticket history must be clearly labeled as application-level");
    for (const replyContract of ["View conversation", "data-open-ticket-conversation", "data-ticket-reply-form", "Send reply", "/tickets/\"+encodeURIComponent(ticketId)+\"/replies", "Reply sent.", "Reply not sent", "authorRole===\"support\"?\"Support\":\"You\""]) {
      assert.ok(html.includes(replyContract), "customer ticket conversation must expose: " + replyContract);
    }
    assert.match(html, /if\(generation!==sessionGeneration\|\|application\.value\.trim\(\)!==app\|\|!form\.isConnected\)return;/, "late reply responses must not mutate a disconnected or different application view");

    assert.ok(html.includes("only tickets for the application selected above are shown here"), "customer UI must explain application-level ticket visibility");
    for (const ticketContract of ["ticketForm", "ticketApplication", "businessImpact", "/customer/applications/", "Submit ticket", "Load my tickets", "ticketResult"]) {
      assert.ok(html.includes(ticketContract), "customer ticket UI must expose: " + ticketContract);
    }
    assert.match(html, /method:"POST",headers:\{"idempotency-key":pendingIdempotencyKey\},body:JSON\.stringify\(pendingTicketPayload\)/, "ticket submission must retry the original payload with a stable idempotency key");
    assert.match(html, /JSON\.stringify\(body\)!==JSON\.stringify\(pendingTicketPayload\)/, "edited form data must not silently reuse an idempotency key after an uncertain outcome");
    assert.match(html, /let pendingTicketApplication=""/, "uncertain ticket retries must remember their original application");
    assert.match(html, /app!==pendingTicketApplication\|\|JSON\.stringify\(body\)!==JSON\.stringify\(pendingTicketPayload\)/, "retry must not move an uncertain submission to another application");
    assert.match(html, /pendingTicketApplication=app/, "the application must be captured when a ticket submission begins");
    assert.match(html, /pendingTicketPayload=null/, "successful ticket submission must clear the pending retry snapshot");
    assert.match(html, /payload\.tickets/, "ticket history must be loaded from the tenant-scoped API");
    assert.match(html, /sequence!==ticketLoadSequence\|\|application\.value\.trim\(\)!==app/, "late ticket responses must not overwrite the selected application history");
    assert.match(html, /let viewLoadSequence=0/, "customer workspace must sequence async view loads");
    assert.match(html, /let sessionGeneration=0/, "customer session lifecycle must have a generation guard");
    assert.match(html, /const requestGeneration=sessionGeneration;if\(path!=="\/customer\/session"&&!authenticated\)/, "each API call must be bound to the active browser session generation");
    assert.match(html, /if\(requestGeneration!==sessionGeneration\)throw new Error\("customer_session_changed"\)/, "API responses must be rejected after logout or reconnect");
    assert.match(html, /if\(path!=="\/customer\/session"&&!authenticated\)throw new Error\("customer_session_disconnected"\)/, "customer API calls must fail closed without an authenticated browser session");
    assert.match(html, /const generation=\+\+sessionGeneration/, "a new connection attempt must invalidate prior session requests");
    assert.match(html, /if\(generation!==sessionGeneration\)return;/, "late connection responses must not overwrite the active session");
    assert.match(html, /sessionGeneration\+\+;viewLoadSequence\+\+;authenticated=false;enabledModules\.clear\(\);cards\.replaceChildren\(\)/, "logout must invalidate in-flight requests and clear customer data");
    assert.match(html, /requestSessionGeneration!==sessionGeneration/, "ticket responses from an earlier session must be ignored");
    assert.match(html, /ticketViewSessionGeneration=sessionGeneration/, "ticket view application bootstrap must capture its session");
    assert.match(html, /if\(ticketViewSessionGeneration!==sessionGeneration\)return;const assigned=/, "late assigned-application responses must not mutate a stale ticket view");
    assert.match(html, /requestSessionGeneration!==sessionGeneration\|\|sequence!==ticketLoadSequence/, "ticket-history errors from earlier sessions must be ignored");
    assert.match(html, /const submissionSessionGeneration=sessionGeneration/, "ticket submissions must capture the session that initiated them");
    assert.match(html, /if\(submissionSessionGeneration!==sessionGeneration\)return;result\.textContent="Ticket submitted\./, "late ticket success must not update the UI after a session change");
    assert.match(html, /if\(submissionSessionGeneration===sessionGeneration\)\{form\.dataset\.submitting="false";submitButton\.disabled=application\.disabled\|\|!application\.value;\}/, "late ticket completion must not mutate stale form controls");
    assert.match(html, /if\(renderSequence!==viewLoadSequence\)return;/, "late view responses must not overwrite the currently selected section");
    assert.match(html, /loadAllClientAssets\(\)\.then\(initialItems=>\{if\(renderSequence!==viewLoadSequence\)return;/, "late asset-manifest responses must not replace another active view");
    assert.match(html, /api\("\/customer\/assets\?all=true"\)/, "all client assets are fetched with one API request");
    assert.ok(html.includes("assetSearch"), "client asset view provides text search");
  assert.ok(html.includes("clearAssetSearch"), "client asset search can be cleared without another API request");
  assert.ok(html.includes("clearAssetFilters"), "client asset filters can be reset together");
  assert.ok(html.includes('search.value="";filter.value="all";applicationFilter.value="all";sortOrder.value="name";search.focus();drawAssets();'), "resetting filters restores default search, type, application, and sort locally");
  assert.ok(html.includes('search.value="";search.focus();drawAssets();'), "clearing search resets the local filter and returns focus to the search field");
  assert.ok(html.includes('event.key==="Escape"&&search.value'), "Escape clears a non-empty asset search without changing file-type filtering");
    assert.ok(html.includes("assetApplicationFilter"), "client assets can be filtered by application");
  assert.ok(html.includes('appFilter==="all"||String(asset.applicationId||"")===appFilter'), "application filtering is applied locally to the loaded manifest");
  assert.ok(html.includes("assetTypeFilter"), "client asset view provides file-type filtering");
  assert.ok(html.includes("assetSortOrder"), "client assets can be sorted by name or file type");
  assert.ok(html.includes('<option value="name-desc">Name (Z–A)</option>'), "client assets support reverse alphabetical sorting");
  assert.ok(html.includes('<option value="size-desc">Largest files first</option>'), "client assets can be sorted by size");
  assert.ok(html.includes('if(sort==="size-desc")'), "size sorting is client-side and does not request more data");
  assert.ok(html.includes('if(as===null&&bs!==null)return 1;if(bs===null&&as!==null)return -1'), "assets with unknown sizes sort after assets with known sizes");
  assert.ok(html.includes('sort==="name-desc"?-comparison:comparison'), "reverse sorting uses a local comparator without another API request");
  assert.ok(html.includes('sort==="type"?a.type:a.name'), "asset sorting runs locally without another API request");
    assert.ok(html.includes('filtered.reduce((total,asset)=>total+(Number.isSafeInteger(asset.sizeBytes)&&asset.sizeBytes>=0?asset.sizeBytes:0),0)'), "filtered asset view summarizes known file sizes locally");
  assert.ok(html.includes('" known size"'), "asset size summary labels the total as known size when metadata is missing");
  assert.ok(html.includes("unknownSizeCount"), "asset summary counts assets with missing or invalid size metadata");
  assert.ok(html.includes('" size unknown":"")'), "asset summary visibly distinguishes unknown sizes from zero bytes");
  assert.ok(html.includes("No matching assets"), "empty filtered results explain how to recover");
  assert.ok(html.includes("No assets available"), "an empty manifest has a distinct actionable empty state");
  assert.ok(html.includes("share assets with an assigned application"), "empty manifest guidance tells the customer how to resolve missing assets");
  assert.ok(html.includes("exportClientAssets"), "customer can export the currently visible asset inventory");
  assert.ok(html.includes("visibleItems.map(asset=>columns.map(column=>csvCell(asset[column])).join(","))"), "CSV export follows active search and filters");
  assert.ok(html.includes("URL.createObjectURL(new Blob(["), "CSV export is generated locally without another API request");
  assert.ok(html.includes("exportButton.disabled=filtered.length===0"), "CSV export is disabled when filters produce no visible assets");
  assert.ok(html.includes("setTimeout(()=>URL.revokeObjectURL(url),1000)"), "CSV object URL remains valid briefly for browser download handling");
  assert.ok(html.includes('/^[\\s]*[=+\\-@]/.test(text)'), "CSV export neutralizes spreadsheet formula-leading values");
  assert.ok(html.includes("refreshClientAssets"), "client assets can be refreshed asynchronously");
  assert.ok(html.includes("Refreshing all client assets"), "asset refresh exposes loading status");
  assert.ok(html.includes("refresh.disabled=true"), "refresh prevents duplicate concurrent manifest requests");
  assert.ok(html.includes("Refresh failed. Existing results are retained."), "failed refresh preserves the last successful asset list");
  assert.ok(html.includes('Refreshed "+items.length+" assets.'), "successful refresh reports the updated asset count");
  assert.ok(html.includes("@media(max-width:480px){.asset-refresh-row"), "asset refresh controls stack on narrow mobile screens");
    assert.match(html, /application\.addEventListener\("change",loadTickets\)/, "changing the assigned application must reload its ticket history");
    assert.match(html, /else if\(assigned\.length===1\)\{application\.value=assigned\[0\]\.applicationId;loadTickets\(\);\}/, "ticket history should load automatically when exactly one assigned application removes ambiguity");
    assert.match(html, /submitButton\.disabled=application\.disabled\|\|!application\.value/, "ticket submission must remain disabled when no assigned application is available");
    assert.match(html, /moduleByView=\{help:"help-center",growth:"growth-hub",assets:"client-assets",tickets:"tickets-feedback"\}/, "home cards must map all entitled customer modules");
    assert.match(html, /v\.cards\.filter\(c=>!moduleByView\[c\[3\]\]\|\|enabledModules\.has\(moduleByView\[c\[3\]\]\)\)/, "disabled modules must not appear as home cards");
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


test("durable customer identity mode refuses missing identity and assignment stores", () => {
  const names = ["EPER_CUSTOMER_IDENTITY_PERSISTENCE", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE"];
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  try {
    assert.throws(() => createAppServer(), { message: "CUSTOMER_IDENTITY_SESSION_STORE_REQUIRED_IN_POSTGRES_MODE" });
    assert.throws(() => createAppServer({ customerIdentitySessionStore: {} }), { message: "CUSTOMER_IDENTITY_REQUIRES_DURABLE_TENANT_AND_ACTOR_APPLICATION_ASSIGNMENT_STORES" });
  } finally {
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  }
});
