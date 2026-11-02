import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { chromium } from "playwright";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../dist/apps/api/server.js";
import { appendAuditEventInTransaction } from "../dist/packages/audit/audit-event-store.js";
import { PostgresCustomerIdentitySessionStore } from "../dist/packages/identity/postgres-customer-identity-session-store.js";
import { PostgresTenantApplicationAssignmentStore } from "../dist/packages/identity/postgres-tenant-application-assignment-store.js";
import { PostgresActorApplicationAssignmentStore } from "../dist/packages/identity/postgres-actor-application-assignment-store.js";
import { PostgresTicketStore } from "../dist/packages/ticketing/postgres-ticket-store.js";

const { Pool } = pg;

test("browser OIDC login grants the customer workspace and support journey, logout revokes access", async () => {
  const proxyKeys = ["HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","http_proxy","https_proxy","all_proxy","NO_PROXY","no_proxy"];
  const proxyPrevious = Object.fromEntries(proxyKeys.map(key => [key, process.env[key]]));
  for (const key of proxyKeys) delete process.env[key];
  process.env.NO_PROXY = "127.0.0.1,localhost";
  process.env.no_proxy = process.env.NO_PROXY;
  const keys = ["EPER_CUSTOMER_OIDC_ENABLED","EPER_CUSTOMER_IDENTITY_PERSISTENCE","EPER_CUSTOMER_PORTAL_API_ENABLED","EPER_TICKETING_API_ENABLED","EPER_CUSTOMER_WORKSPACE_MODULES_JSON","EPER_CUSTOMER_APPLICATION_SETTINGS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const state="s".repeat(43), nonce="n".repeat(43);
  const issuer="https://idp.example.test";
  const subject="subject-"+randomUUID();
  const tenantId="tenant-"+randomUUID();
  const actorId="actor-"+randomUUID();
  const applicationId="app-"+randomUUID();
  const correlationId="corr-"+randomUUID();
  let origin="", backendOrigin="", server, tlsServer, browser, certDir, pool, sessionHash="", ticketId="";
  try {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for durable PostgreSQL browser coverage");
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:8});
    Object.assign(process.env, {
      EPER_CUSTOMER_OIDC_ENABLED:"true", EPER_CUSTOMER_IDENTITY_PERSISTENCE:"postgres",
      EPER_CUSTOMER_PORTAL_API_ENABLED:"true", EPER_TICKETING_API_ENABLED:"true",
      EPER_CUSTOMER_WORKSPACE_MODULES_JSON:JSON.stringify({[tenantId]:["settings","tickets-feedback"]}),
      EPER_CUSTOMER_APPLICATION_SETTINGS_JSON:JSON.stringify({[tenantId]:{[applicationId]:{displayName:"Customer workspace",locale:"en-US",currency:"USD"}}}),
    });
    const store=new PostgresCustomerIdentitySessionStore(pool);
    const tenantAssignments=new PostgresTenantApplicationAssignmentStore(pool);
    const actorAssignments=new PostgresActorApplicationAssignmentStore(pool);
    const ticketAuditWriter=async(event,client)=>appendAuditEventInTransaction(client,{
      tenantId:event.tenantId,applicationId:event.applicationId,environment:"sandbox",
      actorType:"human",actorId:event.actorId,action:event.action,outcome:event.outcome,
      resourceType:"support-ticket",resourceId:event.ticketId,correlationId:event.correlationId,
      source:"ui",operationName:"customer-support-browser-e2e",payload:event.payload,
    });
    const ticketStore=new PostgresTicketStore(pool,ticketAuditWriter);
    await store.assertReady();
    await tenantAssignments.assertReady();
    await actorAssignments.assertReady();
    await ticketStore.assertReady();
    await store.bindSubject({issuer,subject,tenantId,actorId,provisionedBy:"browser-e2e-provisioner",correlationId});
    await pool.query(
      "INSERT INTO eper_tenant_application_assignment (tenant_id,application_id,assignment_status,version,assigned_by,updated_by) VALUES ($1,$2,'active',1,'browser-e2e','browser-e2e')",
      [tenantId,applicationId],
    );
    await pool.query(
      "INSERT INTO eper_actor_application_assignment (tenant_id,actor_id,application_id,assignment_status,version,assigned_by,updated_by) VALUES ($1,$2,$3,'active',1,'browser-e2e','browser-e2e')",
      [tenantId,actorId,applicationId],
    );
    assert.deepEqual(await tenantAssignments.listActive(tenantId),[applicationId]);
    assert.equal(await actorAssignments.isAssigned(tenantId,actorId,applicationId),true);
    assert.equal(await actorAssignments.isAssigned(tenantId,actorId,"app-unassigned"),false);
    const client={
      async beginLogin(loginStore){
        await loginStore.createLoginTransaction({
          stateHash:createHash("sha256").update(state).digest("hex"),
          nonceHash:createHash("sha256").update(nonce).digest("hex"),
          pkceVerifierCiphertext:"synthetic-test-pkce-verifier-ciphertext-".repeat(2),
          issuer,redirectUri:origin+"/customer/auth/oidc/callback",
          expiresAt:new Date(Date.now()+5*60_000),
        });
        return {authorizationUrl:origin+"/mock-idp?state="+state,state};
      },
      async completeLogin(loginStore,code,receivedState){
        assert.equal(code,"browser-code");
        const transaction=await loginStore.consumeLoginTransaction(receivedState);
        assert.ok(transaction,"OIDC login state must be consumed from PostgreSQL exactly once");
        assert.equal(transaction.issuer,issuer);
        assert.equal(transaction.nonceHash,createHash("sha256").update(nonce).digest("hex"));
        assert.equal(transaction.redirectUri,origin+"/customer/auth/oidc/callback");
        return {issuer,subject};
      },
    };
    const serverOptions={
      customerOidcClient:client,customerIdentitySessionStore:store,ticketStore,
      tenantApplicationAssignmentStore:tenantAssignments,actorApplicationAssignmentStore:actorAssignments,
      customerOidcPublicOrigin:"https://localhost",customerCsrfSecret:"c".repeat(48),
    };
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
    const requestFailures=[];
    const consoleErrors=[];
    page.on("response",response=>{const url=new URL(response.url());if(url.pathname.startsWith("/customer/"))customerResponses.push(url.pathname+" "+response.status());});
    page.on("pageerror",error=>pageErrors.push(error.message));
    page.on("requestfailed",request=>{if(request.url().includes("/customer/"))requestFailures.push(request.url()+" "+request.failure()?.errorText);});
    page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});
    await page.goto(origin+"/customer-portal-preview");
    await page.getByRole("link",{name:"Sign in with your organization"}).click();
    await page.getByRole("link",{name:"Continue sign in"}).click();
    await page.waitForURL("**/customer-portal-preview");
    await page.waitForTimeout(1200);
    const browserCookies=await context.cookies(origin);
    const sessionCookie=browserCookies.find(cookie=>cookie.name==="__Host-eper_session");
    const csrfCookie=browserCookies.find(cookie=>cookie.name==="__Host-eper_csrf");
    assert.ok(sessionCookie,"browser must receive the host-only session cookie");
    assert.equal(sessionCookie.httpOnly,true);
    assert.equal(sessionCookie.secure,true);
    assert.equal(sessionCookie.sameSite,"Lax");
    assert.ok(csrfCookie,"browser must receive the CSRF cookie");
    assert.equal(csrfCookie.secure,true);
    assert.equal(csrfCookie.sameSite,"Strict");
    sessionHash=createHash("sha256").update(sessionCookie.value).digest("hex");
    const storedSession=await pool.query("SELECT session_hash,revoked_at FROM eper_customer_browser_sessions WHERE session_hash=$1 AND tenant_id=$2",[sessionHash,tenantId]);
    assert.equal(storedSession.rowCount,1);
    assert.equal(String(storedSession.rows[0].session_hash).trim(),sessionHash);
    assert.equal(storedSession.rows[0].revoked_at,null);
    const connectionMessage=await page.locator("#connectResult").textContent();
    assert.equal(connectionMessage,"Your organization session is active.",
      "browser workspace bootstrap failed; message="+connectionMessage+" url="+page.url()+" customer responses="+JSON.stringify(customerResponses)+" request failures="+JSON.stringify(requestFailures)+" page errors="+JSON.stringify(pageErrors)+" console errors="+JSON.stringify(consoleErrors));
    await page.getByRole("button",{name:"Tickets & Feedback"}).click();
    await page.getByLabel("Title").fill("Browser-authenticated support request");
    await page.getByLabel("Description").fill("Customer can submit a support request after OIDC sign-in.");
    await page.getByLabel("Business impact").fill("The customer workspace support journey must be authenticated and scoped.");
    await page.getByRole("button",{name:"Submit ticket"}).click();
    await page.getByText(/Ticket submitted\\. Reference:/).waitFor();
    const confirmation=await page.getByText(/Ticket submitted\\. Reference:/).textContent();
    const ticketMatch=confirmation?.match(/Reference:\\s*([0-9a-f-]{36})/i);
    assert.ok(ticketMatch,"customer confirmation must include the durable ticket reference: "+confirmation);
    ticketId=ticketMatch[1];
    const persistedTicket=await pool.query("SELECT tenant_id,application_id,created_by,status FROM eper_support_tickets WHERE id=$1",[ticketId]);
    assert.equal(persistedTicket.rowCount,1);
    assert.equal(persistedTicket.rows[0].tenant_id,tenantId);
    assert.equal(persistedTicket.rows[0].application_id,applicationId);
    assert.equal(persistedTicket.rows[0].created_by,actorId);
    const ticketAudit=await pool.query("SELECT action,tenant_id,application_id,actor_id FROM eper_audit_events WHERE resource_id=$1 AND action='ticket.created'",[ticketId]);
    assert.equal(ticketAudit.rowCount,1);
    assert.equal(ticketAudit.rows[0].tenant_id,tenantId);
    assert.equal(ticketAudit.rows[0].application_id,applicationId);
    assert.equal(ticketAudit.rows[0].actor_id,actorId);
    await page.getByRole("button",{name:"View conversation"}).click();
    await page.getByLabel("Reply to support").fill("Additional details from the customer browser session.");
    await page.getByRole("button",{name:"Send reply"}).click();
    await page.getByText("Reply sent.").waitFor();
    await page.getByText("Additional details from the customer browser session.").waitFor();
    const persistedReplies=await pool.query(
      "SELECT author_role,visibility,body FROM eper_support_ticket_replies WHERE tenant_id=$1 AND application_id=$2 AND ticket_id=$3 ORDER BY created_at",
      [tenantId,applicationId,ticketId],
    );
    assert.equal(persistedReplies.rowCount,1);
    assert.equal(persistedReplies.rows[0].author_role,"customer");
    assert.equal(persistedReplies.rows[0].visibility,"customer_visible");
    assert.equal(persistedReplies.rows[0].body,"Additional details from the customer browser session.");
    const allowed=await page.goto(origin+"/customer/settings?applicationId="+encodeURIComponent(applicationId));
    assert.equal(allowed.status(),200);
    assert.deepEqual(await allowed.json(),{applicationId,settings:{displayName:"Customer workspace",locale:"en-US",currency:"USD"}});
    const unassigned=await page.goto(origin+"/customer/settings?applicationId=app-unassigned");
    assert.equal(unassigned.status(),403);
    assert.equal((await unassigned.json()).error,"application_not_assigned_to_tenant");
    await page.goto(origin+"/customer-portal-preview");
    await page.getByRole("button",{name:"Sign out"}).click();
    await page.getByRole("link",{name:"Sign in with your organization"}).waitFor();
    const denied=await page.goto(origin+"/customer/settings?applicationId="+encodeURIComponent(applicationId));
    assert.equal(denied.status(),401);
    assert.equal((await denied.json()).error.code,"UNAUTHENTICATED");
    const revokedSession=await pool.query("SELECT revoked_at,revoked_reason FROM eper_customer_browser_sessions WHERE session_hash=$1",[sessionHash]);
    assert.equal(revokedSession.rowCount,1);
    assert.ok(revokedSession.rows[0].revoked_at,"logout must persist session revocation in PostgreSQL");
  } finally {
    if(browser) await browser.close();
    if(tlsServer) await new Promise(resolve=>tlsServer.close(resolve));
    if(certDir) rmSync(certDir,{recursive:true,force:true});
    if(server) await new Promise(resolve=>server.close(resolve));
    if(pool) await pool.end();
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    for(const [key,value] of Object.entries(proxyPrevious)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
