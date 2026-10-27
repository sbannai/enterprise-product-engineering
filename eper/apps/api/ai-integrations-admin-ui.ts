import type { IncomingMessage } from "node:http";
import { enterpriseDesignSystemCss } from "./design-system.js";

/** Same-origin tenant admin UI. Bearer credentials remain in memory and are never persisted. */
export const aiIntegrationsAdminHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER · AI Integrations</title><style>
:root{color-scheme:light;--ink:#17233b;--muted:#63718a;--line:#dfe5ee;--bg:#f4f7fb;--card:#fff;--navy:#142544;--blue:#275df5;--green:#13795b;--red:#b42318}
*{box-sizing:border-box}body{margin:0;background:var(--bg);font:14px/1.5 Inter,system-ui,sans-serif;color:var(--ink)}
header{background:var(--navy);color:#fff;padding:22px clamp(16px,4vw,44px)}h1{font-size:20px;margin:0}header p{margin:4px 0 0;color:#c3cce0}.shell{max-width:1000px;margin:auto;padding:24px clamp(14px,3vw,32px) 60px}
.card{background:#fff;border:1px solid var(--line);border-radius:15px;padding:18px;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
label{font-weight:650;font-size:12px;color:var(--muted);display:block;margin-bottom:5px}input,select{font:inherit;width:100%;min-width:0;padding:10px;border:1px solid #cdd6e3;border-radius:9px}
button{font:inherit;font-weight:700;padding:10px 14px;border:0;border-radius:9px;background:var(--blue);color:white;cursor:pointer}button.secondary{background:#e9eef8;color:#263b61}button:disabled{opacity:.5}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.notice{padding:12px;border-radius:10px;background:#fff8e7;border:1px solid #e6c98e;margin-bottom:16px}.status{min-height:22px;color:var(--muted);margin-top:8px}.status.error{color:var(--red)}.status.ok{color:var(--green)}
table{width:100%;border-collapse:collapse;min-width:560px}th,td{text-align:left;padding:11px;border-bottom:1px solid #edf0f5}th{font-size:11px;color:var(--muted);text-transform:uppercase}.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:10px}.toggle{width:20px;height:20px;accent-color:var(--blue)}.muted{color:var(--muted);font-size:12px}
@media(max-width:640px){.grid{grid-template-columns:1fr}.card{padding:14px}}
${enterpriseDesignSystemCss}</style></head><body>
<header><h1>EPER · AI Integration Controls</h1><p>Tenant admin · Per-application enablement · Audited configuration</p></header>
<main class="shell">
<div class="notice"><strong>Owner-controlled:</strong> AI integrations are disabled by default when no setting exists. Switching an application off must block AI-agent requests for that application. This control does not revoke credentials at the provider; credentials remain server-side.</div>
<section class="card"><h2>Connect to your admin API</h2><p class="muted">Use the same-origin API where possible. Your bearer credential is held only in this page's memory.</p>
<div class="grid"><div><label for="apiBase">API base URL</label><input id="apiBase" placeholder="Same origin" autocomplete="url"></div><div><label for="token">Admin bearer credential</label><input id="token" type="password" autocomplete="off" placeholder="Paste admin credential"></div></div>
<div class="actions"><button id="load">Load application settings</button><button class="secondary" id="clear">Clear credential</button></div><div id="status" class="status" role="status" aria-live="polite"></div></section>
<section class="card"><h2>Application integration</h2><p class="muted">Enter the application identifier assigned by your EPER administrator. Changes are saved with optimistic version checks and an audit event.</p>
<div class="grid"><div><label for="appId">Application ID</label><input id="appId" maxlength="128" placeholder="e.g. sales-crm"></div><div><label for="provider">AI provider</label><select id="provider"><option value="none">None (disabled)</option><option value="openai">OpenAI</option><option value="azure-openai">Azure OpenAI</option><option value="google">Google</option><option value="anthropic">Anthropic</option><option value="provider-neutral">Provider-neutral adapter</option></select></div></div>
<div class="actions"><button id="save">Save settings</button></div><div class="muted" id="version"></div></section>
<section class="card"><h2>Configured applications</h2><div class="tablewrap"><table><thead><tr><th>Application</th><th>AI status</th><th>Provider</th><th>Action</th></tr></thead><tbody id="rows"><tr><td colspan="4">Load settings to view configured applications.</td></tr></tbody></table></div></section>
</main>
<script>
(()=>{let version=0,apps={};const el=id=>document.getElementById(id);const status=(message,kind="")=>{el("status").textContent=message;el("status").className="status "+kind};
const base=()=>el("apiBase").value.trim().replace(/\/$/,"")||location.origin;
async function api(method,body){const headers={"accept":"application/vnd.eper.v1+json","authorization":"Bearer "+el("token").value.trim()};if(body)headers["content-type"]="application/json";const response=await fetch(base()+"/admin/config/ai-integrations",{method,headers,body:body?JSON.stringify(body):undefined});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error?.message||data.error||("HTTP "+response.status));return data.data||data}
function render(){const rows=Object.entries(apps).sort(([a],[b])=>a.localeCompare(b));el("rows").replaceChildren();if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=4;td.textContent="No application overrides yet. New integrations default to OFF.";tr.append(td);el("rows").append(tr);return}
for(const [id,config] of rows){const tr=document.createElement("tr");for(const value of [id,config.enabled?"ON":"OFF",config.provider||"none"]){const td=document.createElement("td");td.textContent=value;tr.append(td)}const td=document.createElement("td"),button=document.createElement("button");button.className=config.enabled?"secondary":"";button.textContent=config.enabled?"Switch OFF":"Switch ON";button.addEventListener("click",()=>{el("appId").value=id;el("provider").value=config.provider||"none";el("save").dataset.enabled=String(!config.enabled);el("save").textContent=!config.enabled?"Save and switch ON":"Save and switch OFF";el("appId").focus()});td.append(button);tr.append(td);el("rows").append(tr)}}
async function load(){if(!el("token").value.trim()){status("Enter your admin credential first.","error");return}try{const result=await api("GET");version=result.version||0;apps=result.config?.applications&&typeof result.config.applications==="object"?result.config.applications:{};render();el("version").textContent="Configuration version "+version;status("Settings loaded. Unconfigured applications remain OFF.","ok")}catch(e){status(e.message,"error")}}
async function save(){const id=el("appId").value.trim();if(!id||id.length>128){status("Enter a valid application ID.","error");return}const provider=el("provider").value;const enabled=el("save").dataset.enabled?el("save").dataset.enabled==="true":provider!=="none";if(enabled&&provider==="none"){status("Choose a provider before switching AI ON.","error");return}const next={applications:{...apps,[id]:{enabled,provider:enabled?provider:"none"}}};try{const result=await api("PUT",{config:next,expectedVersion:version});version=result.version;apps=result.config.applications;render();el("version").textContent="Configuration version "+version;delete el("save").dataset.enabled;el("save").textContent="Save settings";status(id+" saved as "+(enabled?"ON":"OFF")+".","ok")}catch(e){status(e.message+" Reload before retrying if another admin changed settings.","error")}}
el("load").addEventListener("click",load);el("save").addEventListener("click",save);el("clear").addEventListener("click",()=>{el("token").value="";status("Credential cleared from this page.");});if(location.origin!=="null")el("apiBase").value=location.origin;
})();
</script></body></html>`;

export function isAiIntegrationsAdminRequest(request: IncomingMessage): boolean {
  return request.method === "GET" && new URL(request.url ?? "/", "http://localhost").pathname === "/admin/ai-integrations";
}
