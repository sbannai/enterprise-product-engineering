import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePlatformAdminPrincipal, resolvePlatformAdminPrincipalFromStore } from "../../packages/identity/platform-admin-principal.js";
import type { PostgresPlatformAdminCredentialStore } from "../../packages/identity/postgres-platform-admin-credential-store.js";
import type { PostgresPlatformApplicationRemediationStore } from "../../packages/workflows/postgres-platform-application-remediation-store.js";

const platformApplicationRemediationUiHtml = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>EPER · Application remediation</title><style nonce=\"__CSP_NONCE__\">:root{font-family:Inter,system-ui,sans-serif;color:#17243b;background:#f4f7fb}*{box-sizing:border-box}body{margin:0}header{background:#142544;color:white;padding:22px}main{max-width:850px;margin:28px auto;padding:0 16px}.panel{background:white;border:1px solid #dfe6ef;border-radius:14px;padding:20px;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px}.field label{font-size:12px;font-weight:750;color:#526078}input,textarea{width:100%;min-width:0;min-height:42px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}button{border:0;border-radius:8px;padding:11px 16px;min-height:42px;font:inherit;font-weight:750;cursor:pointer;background:#b42318;color:white}button:disabled{opacity:.5}.help{color:#68778d;font-size:12px;line-height:1.5}.notice{padding:12px;border-radius:9px;background:#fff8e6;color:#805b10;font-size:12px}.summary{border:1px solid #dfe6ef;border-radius:10px;padding:14px;background:#f8faff;margin-top:14px}.summary strong{display:block}.status{min-height:24px;margin-top:12px;font-size:12px;color:#68778d}.status.error{color:#b42318}.status.ok{color:#13795b}@media(max-width:650px){.grid{grid-template-columns:1fr}}</style></head><body><header><h1>Product Admin · Application remediation</h1><p>One application at a time · Version-checked · Reasoned · Audited</p></header><main><section class=\"panel\"><h2>Platform operator authentication</h2><p class=\"help\">Use a platform-issued credential with the independent application:remediate permission. Credential remains in page memory only.</p><div class=\"field\"><label for=\"token\">Platform bearer credential</label><input id=\"token\" type=\"password\" autocomplete=\"off\"></div></section><section class=\"panel\"><h2>Confirm the exact application assignment</h2><p class=\"help\">Copy tenant, application and current assignment version from the Product Admin registry. This action never revokes other applications or changes tariff/billing.</p><div class=\"grid\"><div class=\"field\"><label for=\"tenant\">Tenant ID</label><input id=\"tenant\"></div><div class=\"field\"><label for=\"application\">Application ID</label><input id=\"application\"></div><div class=\"field\"><label for=\"version\">Expected assignment version</label><input id=\"version\" type=\"number\" min=\"1\" step=\"1\"></div><div class=\"field\"><label for=\"idempotency\">Idempotency key</label><input id=\"idempotency\"></div><div class=\"field\" style=\"grid-column:1/-1\"><label for=\"reason\">Mandatory incident/ticket reference and reason</label><textarea id=\"reason\" rows=\"3\" maxlength=\"200\"></textarea></div></div><p class=\"help\" id=\"review\">No application selected.</p><button type=\"button\" id=\"newKey\" style=\"background:#e9eef8;color:#263b61\">Generate idempotency key</button> <button type=\"button\" id=\"submit\">Review and suspend this application</button><div id=\"result\" class=\"status\" role=\"status\" aria-live=\"polite\">No operation submitted.</div></section><section class=\"panel notice\"><strong>Safety:</strong> the server rechecks scope, active status and expected version, and commits the assignment change and audit event in one PostgreSQL transaction. No optimistic success is shown. Retry an uncertain request with the same idempotency key.</section></main><script nonce=\"__CSP_NONCE__\">(()=>{const $=id=>document.getElementById(id),status=(m,k=\"\")=>{$(\"result\").textContent=m;$(\"result\").className=\"status \"+k};const key=()=>{$(\"idempotency\").value=globalThis.crypto?.randomUUID?.()??(\"eper-\"+Date.now()+\"-\"+Math.random().toString(16).slice(2))};key();$(\"newKey\").onclick=key;function review(){const t=$(\"tenant\").value.trim(),a=$(\"application\").value.trim(),v=$(\"version\").value,r=$(\"reason\").value.trim();$(\"review\").textContent=t&&a&&v?\"Selected tenant \"+t+\" · application \"+a+\" · expected version \"+v+\" · reason \"+(r||\"missing\"):\"Enter tenant, application and expected assignment version.\"}[\"tenant\",\"application\",\"version\",\"reason\"].forEach(id=>$(id).addEventListener(\"input\",review));$(\"submit\").onclick=async()=>{const token=$(\"token\").value.trim(),tenant=$(\"tenant\").value.trim(),app=$(\"application\").value.trim(),version=Number($(\"version\").value),reason=$(\"reason\").value.trim(),idempotencyKey=$(\"idempotency\").value.trim();if(!token||!tenant||!app||!Number.isSafeInteger(version)||version<1||!reason||reason.length>200||!idempotencyKey){status(\"Complete all fields, including the incident/ticket reason.\",\"error\");return}if(!globalThis.confirm(\"Suspend ONLY \"+app+\" for tenant \"+tenant+\" at expected version \"+version+\"? Reason: \"+reason))return;const b=$(\"submit\");b.disabled=true;status(\"Submitting; waiting for server confirmation…\");try{const response=await fetch(\"/platform/tenants/\"+encodeURIComponent(tenant)+\"/applications/\"+encodeURIComponent(app)+\"/remediation\",{method:\"POST\",headers:{authorization:\"Bearer \"+token,\"content-type\":\"application/json\",accept:\"application/json\",\"idempotency-key\":idempotencyKey},body:JSON.stringify({expectedAssignmentVersion:version,reasonTicketReference:reason})});const data=await response.json().catch(()=>({error:\"invalid_server_response\"}));if(!response.ok)throw new Error(data.error||(\"HTTP \"+response.status));const x=data.result||{};status(\"Server confirmed \"+x.assignmentStatus+\" · \"+x.applicationId+\" · version \"+x.assignmentVersion+\" · active apps \"+x.activeApplicationCount+\" / \"+(x.maxApplications??\"not configured\")+\" · tariff access \"+x.tariffAccessState+\" · correlation \"+x.correlationId+(x.replayed?\" · replayed\":\"\"),\"ok\");$(\"version\").value=String(x.assignmentVersion);$(\"reason\").value=\"\";key();review()}catch(e){status(\"Not confirmed: \"+(e instanceof Error?e.message:\"unknown error\")+\". Do not assume the application changed; retry the identical request with the same idempotency key.\",\"error\")}finally{b.disabled=false}};review()})();</script></body></html>";

function respond(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 16 * 1024) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON_OBJECT_REQUIRED");
  return parsed as Record<string, unknown>;
}

export async function handlePlatformApplicationRemediationRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  dependencies: {
    store?: PostgresPlatformApplicationRemediationStore;
    credentialStore?: PostgresPlatformAdminCredentialStore;
    environment?: "production" | "uat" | "sandbox";
    serviceVersion?: string;
  },
): Promise<boolean> {
  if (pathname === "/platform/application-remediation/ui") {
    if (request.method !== "GET") { respond(response, 405, { error: "method_not_allowed" }); return true; }
    if (process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED !== "true" ||
        !dependencies.store || !dependencies.environment) {
      respond(response, 404, { error: "not_found" }); return true;
    }
    const nonce = Buffer.from(randomUUID()).toString("base64");
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
      "x-content-type-options": "nosniff", "referrer-policy": "same-origin",
    });
    response.end(platformApplicationRemediationUiHtml.replaceAll("__CSP_NONCE__", nonce));
    return true;
  }

  const match = /^\/platform\/tenants\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/applications\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/remediation$/.exec(pathname);
  if (!match) return false;
  if (request.method !== "POST") {
    respond(response, 405, { error: "method_not_allowed" });
    return true;
  }
  if (process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED !== "true" ||
      !dependencies.store || !dependencies.environment) {
    respond(response, 404, { error: "not_found" });
    return true;
  }

  const principal = dependencies.credentialStore
    ? await resolvePlatformAdminPrincipalFromStore(request.headers.authorization, dependencies.credentialStore)
    : resolvePlatformAdminPrincipal(request.headers.authorization, process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON ?? "");
  if (!principal) {
    respond(response, 401, { error: "unauthorized" });
    return true;
  }
  if (!principal.permissions.includes("application:remediate")) {
    respond(response, 403, { error: "platform_application_remediation_permission_denied" });
    return true;
  }

  try {
    const body = await readBody(request);
    const allowed = ["expectedAssignmentVersion", "reasonTicketReference"];
    if (Object.keys(body).some(key => !allowed.includes(key))) {
      respond(response, 400, { error: "invalid_platform_application_remediation_body" });
      return true;
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (!Number.isSafeInteger(body.expectedAssignmentVersion) ||
        typeof body.reasonTicketReference !== "string" || !body.reasonTicketReference.trim() ||
        body.reasonTicketReference.length > 200 ||
        typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 200) {
      respond(response, 400, { error: "platform_application_remediation_fields_required" });
      return true;
    }
    const correlationHeader = request.headers["x-correlation-id"];
    const correlationId = typeof correlationHeader === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(correlationHeader)
      ? correlationHeader : randomUUID();
    const result = await dependencies.store.remediate({
      principal,
      tenantId: match[1],
      applicationId: match[2],
      expectedAssignmentVersion: body.expectedAssignmentVersion as number,
      reasonTicketReference: body.reasonTicketReference,
      idempotencyKey,
      correlationId,
      environment: dependencies.environment,
      serviceVersion: dependencies.serviceVersion,
    });
    respond(response, result.replayed ? 200 : 200, { result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PLATFORM_APPLICATION_REMEDIATION_FAILED";
    const status = message.includes("PERMISSION_DENIED") ? 403 :
      message.includes("VERSION_CONFLICT") || message.includes("IDEMPOTENCY_KEY_REUSED") ? 409 :
      message.includes("NOT_FOUND") ? 404 :
      message === "REQUEST_BODY_TOO_LARGE" ? 413 :
      error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400 :
      message.includes("INVALID_") || message.includes("REQUIRED") || message.includes("EXPECTED_VERSION_INVALID") ? 400 : 422;
    respond(response, status, { error: message });
  }
  return true;
}
