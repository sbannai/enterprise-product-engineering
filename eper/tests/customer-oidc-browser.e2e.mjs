import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  let origin="", backendOrigin="", active=false, server, tlsServer, browser, certDir;
  const store={
    async createLoginTransaction(){},
    async consumeLoginTransaction(){return {nonceHash:"n",pkceVerifierCiphertext:"p",issuer:"https://idp.example.test",redirectUri:origin+"/customer/auth/oidc/callback"};},
    async resolveSubject(issuer,subject){return {issuer,subject,tenantId:"tenant-01",actorId:"actor-01",status:"active",version:1};},
    async createSession(){active=true;return {sessionToken,session:{tenantId:"tenant-01",actorId:"actor-01"}};},
    async resolveSession(token){return active&&token===sessionToken?{tenantId:"tenant-01",actorId:"actor-01"}:null;},
    async revokeSession(token){assert.equal(token,sessionToken);active=false;return true;},
  };
  try {
    const client={async beginLogin(){return {authorizationUrl:origin+"/mock-idp?state="+state,state};},async completeLogin(){return {issuer:"https://idp.example.test",subject:"subject-01"};}};
    const serverOptions={customerOidcClient:client,customerIdentitySessionStore:store,
      tenantApplicationAssignmentStore:{async listActive(){return ["app-01"];}},
      actorApplicationAssignmentStore:{async isAssigned(){return true;}},
      customerOidcPublicOrigin:"https://localhost",customerCsrfSecret:"c".repeat(48)};
    server=createAppServer(serverOptions);
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"0.0.0.0",resolve);});
    const address=server.address();
    assert.ok(address && typeof address !== "string");
    backendOrigin="http://127.0.0.1:"+address.port;
    certDir=mkdtempSync(join(tmpdir(),"eper-oidc-cert-"));
    const keyPath=join(certDir,"key.pem"), certPath=join(certDir,"cert.pem");
    execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",keyPath,"-out",certPath,"-days","1","-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost"]);
    tlsServer=https.createServer({key:readFileSync(keyPath),cert:readFileSync(certPath)},async(req,res)=>{
      if(req.url==="/mock-idp"){res.writeHead(200,{"content-type":"text/html"});res.end('<a href="'+origin+'/customer/auth/oidc/callback?code=browser-code&state='+state+'">Continue sign in</a>');return;}
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      try{
        const upstream=await fetch(backendOrigin+req.url,{method:req.method,headers:req.headers,body:["GET","HEAD"].includes(req.method)?undefined:Buffer.concat(chunks),redirect:"manual"});
        const headers=Object.fromEntries(upstream.headers.entries());
        const cookies=upstream.headers.getSetCookie?.();if(cookies?.length)headers["set-cookie"]=cookies;
        res.writeHead(upstream.status,headers);res.end(Buffer.from(await upstream.arrayBuffer()));
      }catch{res.writeHead(502);res.end();}
    });
    await new Promise((resolve,reject)=>{tlsServer.once("error",reject);tlsServer.listen(0,"127.0.0.1",resolve);});
    origin="https://localhost:"+tlsServer.address().port;
    serverOptions.customerOidcPublicOrigin=origin;
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    const page=await context.newPage();
    await page.goto(origin+"/customer/auth/oidc/start?returnTo="+encodeURIComponent("/customer/settings?applicationId=app-01"));
    await page.getByRole("link",{name:"Continue sign in"}).click();
    await page.waitForURL("**/customer/settings?applicationId=app-01");
    const allowed=await page.goto(origin+"/customer/settings?applicationId=app-01");
    assert.equal(allowed.status(),200);
    assert.deepEqual(await allowed.json(),{applicationId:"app-01",settings:{displayName:"Customer workspace",locale:"en-US",currency:"USD"}});
    const logout=await page.evaluate(async()=>{
      const csrf=document.cookie.split("; ").find(v=>v.startsWith("__Host-eper_csrf="))?.split("=")[1]??"";
      return (await fetch("${origin}/customer/auth/logout",{method:"POST",headers:{"x-csrf-token":csrf}})).status;
    });
    assert.equal(logout,204);
    const denied=await page.goto(base+"/customer/settings?applicationId=app-01");
    assert.equal(denied.status(),401);
    assert.equal((await denied.json()).error,"UNAUTHENTICATED");
  } finally {
    if(browser) await browser.close();
    if(tlsServer) await new Promise(resolve=>tlsServer.close(resolve));
    if(certDir) rmSync(certDir,{recursive:true,force:true});
    if(server) await new Promise(resolve=>server.close(resolve));
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    for(const [key,value] of Object.entries(proxyPrevious)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
