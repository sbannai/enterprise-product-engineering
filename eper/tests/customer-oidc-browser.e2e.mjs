import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../dist/apps/api/server.js";

test("browser OIDC login grants the customer workspace and support journey, logout revokes access", async () => {
  const proxyKeys = ["HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","http_proxy","https_proxy","all_proxy","NO_PROXY","no_proxy"];
  const proxyPrevious = Object.fromEntries(proxyKeys.map(key => [key, process.env[key]]));
  for (const key of proxyKeys) delete process.env[key];
  process.env.NO_PROXY = "127.0.0.1,localhost";
  process.env.no_proxy = process.env.NO_PROXY;
  const keys = ["EPER_CUSTOMER_OIDC_ENABLED","EPER_CUSTOMER_IDENTITY_PERSISTENCE","EPER_CUSTOMER_PORTAL_API_ENABLED","EPER_TICKETING_API_ENABLED","EPER_CUSTOMER_WORKSPACE_MODULES_JSON","EPER_CUSTOMER_APPLICATION_SETTINGS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_CUSTOMER_OIDC_ENABLED:"true", EPER_CUSTOMER_IDENTITY_PERSISTENCE:"postgres",
    EPER_CUSTOMER_PORTAL_API_ENABLED:"true", EPER_TICKETING_API_ENABLED:"true",
    EPER_CUSTOMER_WORKSPACE_MODULES_JSON:JSON.stringify({"tenant-01":["settings","tickets-feedback"]}),
    EPER_CUSTOMER_APPLICATION_SETTINGS_JSON:JSON.stringify({"tenant-01":{"app-01":{displayName:"Customer workspace",locale:"en-US",currency:"USD"}}}),
  });
  const state="s".repeat(43), sessionToken="t".repeat(43);
  let origin="", backendOrigin="", active=false, server, tlsServer, browser, certDir;
  const store={
    async createLoginTransaction(){},
    async consumeLoginTransaction(){return {nonceHash:"n",pkceVerifierCiphertext:"p",issuer:"https://idp.example.test",redirectUri:origin+"/customer/auth/oidc/callback"};},
    async resolveSubject(issuer,subject){return {issuer,subject,tenantId:"tenant-01",actorId:"actor-01",status:"active",version:1};},
    async createSession(){active=true;return {sessionToken,session:{tenantId:"tenant-01",actorId:"actor-01"}};},
    async resolveSession(token){return active&&token===sessionToken?{tenantId:"tenant-01",actorId:"actor-01",issuer:"https://idp.example.test",subject:"subject-01",createdAt:"2026-11-02T00:00:00.000Z",lastSeenAt:"2026-11-02T00:00:00.000Z",idleExpiresAt:"2026-11-02T08:00:00.000Z",absoluteExpiresAt:"2026-11-03T00:00:00.000Z"}:null;},
    async revokeSession(token){assert.equal(token,sessionToken);active=false;return true;},
  };
  try {
    const client={async beginLogin(){return {authorizationUrl:origin+"/mock-idp?state="+state,state};},async completeLogin(){return {issuer:"https://idp.example.test",subject:"subject-01"};}};
    const tickets=[];
    const replies=[];
    const ticketId="00000000-0000-4000-8000-000000000001";
    const ticketStore={
      async assertReady(){},
      async create(identity,input){const ticket={id:ticketId,tenantId:identity.tenantId,applicationId:identity.applicationId,actorId:identity.actorId,...input,status:"new",severity:"normal",createdAt:"2026-11-02T00:00:00.000Z"};tickets.push(ticket);return ticket;},
      async list(identity,filters){return tickets.filter(ticket=>ticket.tenantId===identity.tenantId&&ticket.applicationId===filters.applicationId);},
      async listReplies(identity,id,visibility){if(id!==ticketId||!tickets.some(ticket=>ticket.tenantId===identity.tenantId&&ticket.applicationId===identity.applicationId))return null;return replies.filter(reply=>visibility!=="customer"||reply.visibility==="customer_visible");},
      async addReply(identity,id,body,authorRole){if(id!==ticketId||!tickets.some(ticket=>ticket.tenantId===identity.tenantId&&ticket.applicationId===identity.applicationId))return null;const reply={id:"reply-01",authorRole,body,createdAt:"2026-11-02T00:01:00.000Z",visibility:"customer_visible"};replies.push(reply);return reply;},
    };
    const serverOptions={customerOidcClient:client,customerIdentitySessionStore:store,ticketStore,
      tenantApplicationAssignmentStore:{async listActive(){return ["app-01"]; }},
      actorApplicationAssignmentStore:{async listActive(){return ["app-01"];},async isAssigned(){return true;}},
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
      if(req.url?.startsWith("/mock-idp?")){res.writeHead(200,{"content-type":"text/html"});res.end('<a href="'+origin+'/customer/auth/oidc/callback?code=browser-code&state='+state+'">Continue sign in</a>');return;}
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
    const customerResponses=[];
    const pageErrors=[];
    page.on("response",response=>{const url=new URL(response.url());if(url.pathname.startsWith("/customer/"))customerResponses.push(url.pathname+" "+response.status());});
    page.on("pageerror",error=>pageErrors.push(error.message));
    await page.goto(origin+"/customer-portal-preview");
    await page.getByRole("link",{name:"Sign in with your organization"}).click();
    await page.getByRole("link",{name:"Continue sign in"}).click();
    await page.waitForURL("**/customer-portal-preview");
    await page.waitForFunction(()=>{const text=document.getElementById("connectResult")?.textContent||"";return text!=="Checking your customer session…";});
    const connectionMessage=await page.locator("#connectResult").textContent();
    assert.equal(connectionMessage,"Your organization session is active.",
      "browser workspace bootstrap failed; customer responses="+JSON.stringify(customerResponses)+" page errors="+JSON.stringify(pageErrors));
    await page.getByRole("button",{name:"Tickets & Feedback"}).click();
    await page.getByLabel("Title").fill("Browser-authenticated support request");
    await page.getByLabel("Description").fill("Customer can submit a support request after OIDC sign-in.");
    await page.getByLabel("Business impact").fill("The customer workspace support journey must be authenticated and scoped.");
    await page.getByRole("button",{name:"Submit ticket"}).click();
    await page.getByText("Ticket submitted. Reference: "+ticketId).waitFor();
    await page.getByRole("button",{name:"View conversation"}).click();
    await page.getByLabel("Reply to support").fill("Additional details from the customer browser session.");
    await page.getByRole("button",{name:"Send reply"}).click();
    await page.getByText("Reply sent.").waitFor();
    await page.getByText("Additional details from the customer browser session.").waitFor();
    const allowed=await page.goto(origin+"/customer/settings?applicationId=app-01");
    assert.equal(allowed.status(),200);
    assert.deepEqual(await allowed.json(),{applicationId:"app-01",settings:{displayName:"Customer workspace",locale:"en-US",currency:"USD"}});
    await page.goto(origin+"/customer-portal-preview");
    await page.getByRole("button",{name:"Sign out"}).click();
    await page.getByRole("link",{name:"Sign in with your organization"}).waitFor();
    const denied=await page.goto(origin+"/customer/settings?applicationId=app-01");
    assert.equal(denied.status(),401);
    assert.equal((await denied.json()).error.code,"UNAUTHENTICATED");
  } finally {
    if(browser) await browser.close();
    if(tlsServer) await new Promise(resolve=>tlsServer.close(resolve));
    if(certDir) rmSync(certDir,{recursive:true,force:true});
    if(server) await new Promise(resolve=>server.close(resolve));
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    for(const [key,value] of Object.entries(proxyPrevious)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
