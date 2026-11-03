import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePlatformAdminPrincipal } from "../../packages/identity/platform-admin-principal.js";
import type { PostgresPlatformCustomerAdminProvisioningStore } from "../../packages/workflows/postgres-platform-customer-admin-provisioning-store.js";

const MAX_BODY_BYTES = 16 * 1024;

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("PLATFORM_ADMIN_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (size === 0) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("PLATFORM_ADMIN_INVALID_JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PLATFORM_ADMIN_JSON_OBJECT_REQUIRED");
  }
  return parsed as Record<string, unknown>;
}

function respond(request: IncomingMessage, response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "authorization",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function statusFor(message: string): number {
  if (message.includes("PERMISSION_DENIED")) return 403;
  if (message.includes("NOT_ACTIVE") || message.includes("NOT_ALLOWED") ||
      message.includes("INITIAL_PROVISIONING_NOT_ALLOWED") ||
      message.includes("RECOVERY_REQUIRES_PRIOR_ADMIN_HISTORY")) return 409;
  if (message.includes("IDEMPOTENCY_KEY_REUSED")) return 409;
  if (message.includes("INVALID_") || message.includes("REASON_REQUIRED") ||
      message.includes("JSON_") || message.includes("BODY_TOO_LARGE")) return 400;
  if (message.includes("ALREADY_ACTIVE")) return 409;
  return 503;
}

/**
 * Dedicated bearer-authenticated platform routes. They do not use customer
 * sessions, tenant-scoped admin-config credentials, or request-body authority.
 */
const platformCustomerAdminProvisioningUiHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EPER · Platform Customer Admin</title>
<style nonce="__CSP_NONCE__">
:root{font-family:Inter,system-ui,sans-serif;color:#17243b;background:#f4f7fb}*{box-sizing:border-box}body{margin:0}header{background:#142544;color:#fff;padding:22px clamp(16px,4vw,42px)}header h1{margin:0;font-size:22px}header p{margin:5px 0 0;color:#cbd5e5;font-size:13px}main{max-width:980px;margin:28px auto;padding:0 16px}.panel{background:#fff;border:1px solid #dfe6ef;border-radius:14px;padding:20px;margin-bottom:16px;box-shadow:0 5px 20px #16294b08}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px}.field label{font-size:12px;font-weight:750;color:#526078}input,textarea{width:100%;min-width:0;min-height:42px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#17243b;font:inherit}button{border:0;border-radius:8px;padding:10px 14px;min-height:42px;font:inherit;font-weight:700;cursor:pointer;background:#315efb;color:white}button.secondary{background:#e9eef8;color:#263b61}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.help{color:#68778d;font-size:12px;line-height:1.5}.status{min-height:22px;margin-top:12px;color:#68778d;font-size:12px}.status.error{color:#b42318}.status.ok{color:#13795b}.notice{padding:12px;border-radius:9px;background:#fff8e6;color:#805b10;font-size:12px;line-height:1.5}@media(max-width:650px){.grid{grid-template-columns:1fr}.panel{padding:15px}}
</style></head><body><header><h1>Platform Admin · Customer Admin provisioning</h1><p>First-admin setup · Lockout recovery · Tenant/application scoped · Audited operations</p></header><main>
<section class="panel"><h2>Authenticate platform operator</h2><p class="help">Use a platform-issued bearer credential with the specific provisioning or recovery permission. The credential remains in page memory only and is never saved to browser storage.</p><div class="field"><label for="token">Platform bearer credential</label><input id="token" type="password" autocomplete="off" spellcheck="false"></div><div class="status" role="status">Credential is cleared when this page is closed or refreshed.</div></section>
<section class="panel"><h2>Customer and application scope</h2><div class="grid"><div class="field"><label for="tenant">Tenant ID</label><input id="tenant" placeholder="tenant-id"></div><div class="field"><label for="application">Application ID</label><input id="application" placeholder="application-id"></div><div class="field"><label for="actor">Target Customer Admin actor ID</label><input id="actor" placeholder="actor-id"></div><div class="field"><label for="idempotency">Idempotency key</label><input id="idempotency"></div></div><p class="help">The API revalidates active tenant/application and actor membership and the canonical Customer Admin role inside PostgreSQL.</p><div class="actions"><button class="secondary" id="newKey">Generate idempotency key</button></div></section>
<section class="panel"><h2>First Customer Admin</h2><p class="help">Only for applications with no prior Customer Admin assignment. Requires <code>customer_admin:provision</code>.</p><div class="actions"><button id="provision">Provision first Customer Admin</button></div></section>
<section class="panel"><h2>Customer Admin lockout recovery</h2><div class="field"><label for="reason">Incident / ticket reference and recovery reason</label><textarea id="reason" rows="3" placeholder="INC-12345 — all Customer Admin assignments are revoked or inaccessible"></textarea></div><p class="help">Separate break-glass action. Requires <code>customer_admin:recover</code>, a reason, no active Customer Admin, and prior administrator history.</p><div class="actions"><button id="recover">Recover Customer Admin</button></div></section>
<section class="panel"><div class="notice">Mutations are server-authorized, tenant/application scoped, idempotent, versioned, and written with append-only audit in one PostgreSQL transaction. This console does not replace MFA, credential rotation, or operator governance.</div><div id="result" class="status" role="status" aria-live="polite">No operation submitted.</div></section></main>
<script nonce="__CSP_NONCE__">(()=>{const $=id=>document.getElementById(id),show=(m,k="")=>{$("result").textContent=m;$("result").className="status "+k};const key=()=>{$("idempotency").value=globalThis.crypto?.randomUUID?.()??("eper-"+Date.now()+"-"+Math.random().toString(16).slice(2))};$("newKey").addEventListener("click",key);key();async function submit(op){const token=$("token").value.trim(),tenant=$("tenant").value.trim(),app=$("application").value.trim(),actor=$("actor").value.trim(),idempotency=$("idempotency").value.trim(),reason=$("reason").value.trim(),recover=op==="recover";if(!token||!tenant||!app||!actor||!idempotency||(recover&&!reason)){show("Complete all required fields; recovery also requires an incident/ticket reason.","error");return}const button=$(recover?"recover":"provision");button.disabled=true;show("Submitting "+op+" request…");try{const url="/platform/tenants/"+encodeURIComponent(tenant)+"/applications/"+encodeURIComponent(app)+(recover?"/customer-admin-recovery":"/customer-admins");const response=await fetch(url,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json",accept:"application/json","idempotency-key":idempotency},body:JSON.stringify(recover?{targetActorId:actor,reasonTicketReference:reason}:{targetActorId:actor})});const data=await response.json().catch(()=>({error:"invalid_server_response"}));if(!response.ok)throw new Error(data.error||("HTTP "+response.status));const r=data.result||{};show((r.replayed?"Idempotent replay: ":"Success: ")+op+" completed for "+r.actorId+" (assignment version "+r.version+").","ok");$("idempotency").value="";if(recover)$("reason").value=""}catch(e){show("Not completed: "+(e instanceof Error?e.message:"unknown error")+". Retain the same idempotency key when retrying the same request.","error")}finally{button.disabled=false}}$("provision").addEventListener("click",()=>submit("provision"));$("recover").addEventListener("click",()=>submit("recover"))})();</script></body></html>`;

export async function handlePlatformCustomerAdminProvisioningRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  dependencies: {
    store?: PostgresPlatformCustomerAdminProvisioningStore;
    environment?: "production" | "uat" | "sandbox";
    serviceVersion?: string;
  },
): Promise<boolean> {
  if (pathname === "/platform/customer-admin-provisioning/ui") {
    if (request.method !== "GET") { respond(request, response, 405, { error: "method_not_allowed" }); return true; }
    if (process.env.EPER_PLATFORM_CUSTOMER_ADMIN_API_ENABLED !== "true" || !dependencies.store || !dependencies.environment) {
      respond(request, response, 404, { error: "not_found" }); return true;
    }
    const nonce = Buffer.from(randomUUID()).toString("base64");
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
      "x-content-type-options": "nosniff", "referrer-policy": "same-origin",
    });
    response.end(platformCustomerAdminProvisioningUiHtml.replaceAll("__CSP_NONCE__", nonce)); return true;
  }

  const route = /^\/platform\/tenants\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/applications\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/(customer-admins|customer-admin-recovery)$/.exec(pathname);
  if (!route) return false;
  if (request.method !== "POST") {
    respond(request, response, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!dependencies.store || !dependencies.environment) {
    respond(request, response, 503, { error: "platform_customer_admin_unavailable" });
    return true;
  }

  const principal = resolvePlatformAdminPrincipal(
    request.headers.authorization,
    process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON ?? "",
  );
  if (!principal) {
    respond(request, response, 401, { error: "unauthorized" });
    return true;
  }
  const requiredPermission = route[3] === "customer-admins"
    ? "customer_admin:provision" : "customer_admin:recover";
  if (!principal.permissions.includes(requiredPermission)) {
    respond(request, response, 403, { error: "platform_customer_admin_permission_denied" });
    return true;
  }

  try {
    const body = await readBody(request);
    const operation = route[3] === "customer-admins" ? "provision" : "recover";
    const allowedKeys = operation === "provision"
      ? ["targetActorId"]
      : ["targetActorId", "reasonTicketReference"];
    if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
      respond(request, response, 400, { error: "invalid_platform_customer_admin_body" });
      return true;
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof body.targetActorId !== "string" ||
        typeof idempotencyKey !== "string" || !idempotencyKey.trim() ||
        (operation === "recover" && typeof body.reasonTicketReference !== "string")) {
      respond(request, response, 400, { error: "platform_customer_admin_fields_required" });
      return true;
    }
    const correlationHeader = request.headers["x-correlation-id"];
    const correlationId = typeof correlationHeader === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(correlationHeader)
      ? correlationHeader : randomUUID();
    const result = await dependencies.store.mutate({
      principal,
      operation,
      tenantId: route[1],
      applicationId: route[2],
      targetActorId: body.targetActorId,
      idempotencyKey,
      correlationId,
      environment: dependencies.environment,
      ...(operation === "recover" ? { reasonTicketReference: body.reasonTicketReference as string } : {}),
      serviceVersion: dependencies.serviceVersion,
    });
    respond(request, response, result.replayed ? 200 : 201, { result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PLATFORM_CUSTOMER_ADMIN_OPERATION_FAILED";
    const status = statusFor(message);
    respond(request, response, status, {
      error: status === 503 ? "platform_customer_admin_operation_unavailable" : message,
    });
  }
  return true;
}
