import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createAppServer } from "../dist/apps/api/server.js";

test("browser OIDC login grants protected settings, logout revokes access", async () => {
  const proxyKeys = ["HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","http_proxy","https_proxy","all_proxy","NO_PROXY","no_proxy"];
  const proxyPrevious = Object.fromEntries(proxyKeys.map(key => [key, process.env[key]]));
  for (const key of proxyKeys) delete process.env[key];
  process.env.NO_PROXY = "127.0.0.1,localhost";
  process.env.no_proxy = process.env.NO_PROXY;
  const keys = ["EPER_CUSTOMER_OIDC_ENABLED","EPER_CUSTOMER_IDENTITY_PERSISTENCE","EPER_CUSTOMER_PORTAL_API_ENABLED","EPER_CUSTOMER_WORKSPACE_MODULES_JSON","EPER_CUSTOMER_APPLICATION_SETTINGS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_CUSTOMER_OIDC_ENABLED:"true", EPER_CUSTOMER_IDENTITY_PERSISTENCE:"postgres",
    EPER_CUSTOMER_PORTAL_API_ENABLED:"true",
    EPER_CUSTOMER_WORKSPACE_MODULES_JSON:JSON.stringify({"tenant-01":["settings"]}),
    EPER_CUSTOMER_APPLICATION_SETTINGS_JSON:JSON.stringify({"tenant-01":{"app-01":{displayName:"Customer workspace",locale:"en-US",currency:"USD"}}}),
  });
  const state="s".repeat(43), sessionToken="t".repeat(43);
  let origin="https://eper.test", backendOrigin="", active=false, server, browser;
  const store={
    async createLoginTransaction(){},
    async consumeLoginTransaction(){return {nonceHash:"n",pkceVerifierCiphertext:"p",issuer:"https://idp.example.test",redirectUri:origin+"/customer/auth/oidc/callback"};},
    async resolveSubject(issuer,subject){return {issuer,subject,tenantId:"tenant-01",actorId:"actor-01",status:"active",version:1};},
    async createSession(){active=true;return {sessionToken,session:{tenantId:"tenant-01",actorId:"actor-01"}};},
    async resolveSession(token){return active&&token===sessionToken?{tenantId:"tenant-01",actorId:"actor-01"}:null;},
    async revokeSession(token){assert.equal(token,sessionToken);active=false;return true;},
  };
  try {
    const client={async beginLogin(){return {authorizationUrl:"https://idp.example.test/authorize?state="+state,state};},async completeLogin(){return {issuer:"https://idp.example.test",subject:"subject-01"};}};
    const serverOptions={customerOidcClient:client,customerIdentitySessionStore:store,
      tenantApplicationAssignmentStore:{async listActive(){return ["app-01"];}},
      actorApplicationAssignmentStore:{async isAssigned(){return true;}},
      customerOidcPublicOrigin:origin,customerCsrfSecret:"c".repeat(48)};
    server=createAppServer(serverOptions);
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"0.0.0.0",resolve);});
    const address=server.address();
    assert.ok(address && typeof address !== "string");
    backendOrigin="http://127.0.0.1:"+address.port;
    const base=origin;
    browser=await chromium.launch({headless:true,args:["--no-proxy-server","--proxy-server=direct://","--proxy-bypass-list=*"]});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    const page=await context.newPage();
    await context.route("**/*", async route => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (requestUrl.hostname === "idp.example.test") {
        await route.fulfill({status:200,contentType:"text/html",
          body:`<a href="${base}/customer/auth/oidc/callback?code=browser-code&state=${state}">Continue sign in</a>`});
        return;
      }
      if (requestUrl.origin !== base) { await route.continue(); return; }
      // Chromium owns navigation, cookie storage, redirects, fetch and user input.
      // Node bridges only the local HTTP transport for runners where Chromium cannot
      // resolve loopback, while requests still reach the real EPER server.
      const upstream = await fetch(backendOrigin + requestUrl.pathname + requestUrl.search, {
        method: request.method(),
        headers: request.headers(),
        body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer(),
        redirect: "manual",
      });
      const headers = Object.fromEntries(upstream.headers.entries());
      const setCookies = upstream.headers.getSetCookie?.();
      if (setCookies?.length) headers["set-cookie"] = setCookies.join(", ");
      await route.fulfill({status:upstream.status,headers,body:Buffer.from(await upstream.arrayBuffer())});
    });
    await page.goto(base+"/customer/auth/oidc/start?returnTo="+encodeURIComponent("/customer/settings?applicationId=app-01"));
    await page.getByRole("link",{name:"Continue sign in"}).click();
    await page.waitForURL("**/customer/settings?applicationId=app-01");
    const allowed=await page.goto(base+"/customer/settings?applicationId=app-01");
    assert.equal(allowed.status(),200);
    assert.deepEqual(await allowed.json(),{applicationId:"app-01",settings:{displayName:"Customer workspace",locale:"en-US",currency:"USD"}});
    const logout=await page.evaluate(async()=>{
      const csrf=document.cookie.split("; ").find(v=>v.startsWith("__Host-eper_csrf="))?.split("=")[1]??"";
      return (await fetch("/customer/auth/logout",{method:"POST",headers:{"x-csrf-token":csrf}})).status;
    });
    assert.equal(logout,204);
    const denied=await page.goto(base+"/customer/settings?applicationId=app-01");
    assert.equal(denied.status(),401);
    assert.equal((await denied.json()).error,"UNAUTHENTICATED");
  } finally {
    if(browser) await browser.close();
    if(server) await new Promise(resolve=>server.close(resolve));
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    for(const [key,value] of Object.entries(proxyPrevious)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
