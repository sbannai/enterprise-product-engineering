import type { IncomingMessage } from "node:http";
import { enterpriseDesignSystemCss } from "./design-system.js";

/** Same-origin Product Admin console. Bearer credentials remain in page memory only. */
export const providerCatalogueUiHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER · Provider Catalogue</title>
<style>
:root{color-scheme:light;--ink:#17233b;--muted:#63718a;--line:#dfe5ee;--bg:#f4f7fb;--card:#fff;--navy:#142544;--blue:#275df5;--green:#13795b;--amber:#9a5b00;--red:#b42318}
*{box-sizing:border-box}body{margin:0;background:var(--bg);font:14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif;color:var(--ink)}
header{background:var(--navy);color:#fff;padding:22px clamp(16px,4vw,44px);display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap}
.brand{display:flex;gap:12px;align-items:center}.logo{width:38px;height:38px;border-radius:12px;background:#315ff4;display:grid;place-items:center;font-weight:800}.brand h1{font-size:18px;margin:0}.brand p{margin:2px 0 0;color:#c3cce0;font-size:12px}
.shell{max-width:1320px;margin:auto;padding:24px clamp(14px,3vw,32px) 60px}.notice{padding:12px 14px;border:1px solid #e6c98e;background:#fff8e7;border-radius:12px;color:#65450d;margin-bottom:18px}
.toolbar,.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:16px}.field{display:flex;flex-direction:column;gap:5px;min-width:0}.toolbar .field{flex:1;min-width:180px}.field label{font-size:12px;color:var(--muted);font-weight:700}
input,select,textarea{font:inherit;color:var(--ink);border:1px solid #cdd6e3;background:#fff;border-radius:9px;padding:10px 11px;width:100%;min-width:0}
button{font:inherit;font-weight:700;border:0;border-radius:9px;padding:10px 14px;cursor:pointer;background:var(--blue);color:#fff}button.secondary{background:#e9eef8;color:#263b61}button.danger{background:#fff0ef;color:var(--red)}button:disabled{opacity:.45;cursor:not-allowed}
.layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(330px,.8fr);gap:16px;align-items:start}.card h2{font-size:16px;margin:0 0 5px}.sub{color:var(--muted);font-size:12px;margin:0 0 15px}
.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:680px;background:#fff}th,td{text-align:left;padding:11px 12px;border-bottom:1px solid #edf0f5}th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);background:#f8faff}tr:last-child td{border-bottom:0}
tr[data-key]{cursor:pointer}tr[data-key]:hover{background:#f5f8ff}.pill{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:750;background:#eef2f7;color:#49566d}.pill.ACTIVE{background:#e5f6ef;color:#12674e}.pill.SUSPENDED{background:#fff2d8;color:#805000}.pill.DEPRECATED{background:#ffebe9;color:#a32920}
.formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.span2{grid-column:1/-1}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.status{min-height:22px;font-size:12px;color:var(--muted)}.status.error{color:var(--red)}.status.success{color:var(--green)}.help{font-size:12px;color:var(--muted);margin-top:6px}.empty{text-align:center;padding:24px;color:var(--muted)}
@media(max-width:850px){.layout{grid-template-columns:1fr}}@media(max-width:540px){.formgrid{grid-template-columns:1fr}.span2{grid-column:auto}.toolbar .field{min-width:100%}}
${enterpriseDesignSystemCss}
</style></head><body>
<header><div class="brand"><div class="logo">E</div><div><h1>Provider Catalogue</h1><p>Product Admin · platform-wide provider definitions · lifecycle governance</p></div></div><div>EPER · Same-origin administration</div></header>
<main class="shell">
<div class="notice"><strong>Platform control:</strong> only a durable Product Admin credential with <code>provider_catalogue:manage</code> can read or change this catalogue. Customer connections and application bindings are managed separately. Provider secrets do not belong here.</div>
<section class="toolbar"><div class="field"><label for="token">Product Admin bearer token</label><input id="token" type="password" autocomplete="off" placeholder="Token stays in this page's memory"></div><button id="connect">Connect</button><button class="secondary" id="refresh">Refresh</button><span id="connection" class="status" role="status" aria-live="polite">Not connected.</span></section>
<div class="layout">
<section class="card"><h2>Provider definitions</h2><p class="sub">Select a definition to inspect or edit. Deprecated definitions remain visible for audit history.</p><div class="tablewrap"><table><thead><tr><th>Provider</th><th>Adapter</th><th>Capabilities</th><th>Status</th><th>Version</th></tr></thead><tbody id="rows"><tr><td colspan="5" class="empty">Connect to load the catalogue.</td></tr></tbody></table></div><p class="help">The API currently returns a bounded catalogue page. No provider credentials or tenant configuration are exposed here.</p></section>
<section class="card"><h2 id="formTitle">Create provider definition</h2><p class="sub">Adapter, capability and authentication identifiers are validated against server-side registries.</p>
<form id="editor"><div class="formgrid">
<div class="field"><label for="providerKey">Provider key</label><input id="providerKey" required maxlength="96" pattern="[A-Za-z0-9][A-Za-z0-9._:-]*" placeholder="mail-primary"></div>
<div class="field"><label for="displayName">Display name</label><input id="displayName" required maxlength="160" placeholder="Primary Mail"></div>
<div class="field"><label for="adapterKey">Adapter key</label><input id="adapterKey" required maxlength="128" placeholder="registered adapter"></div>
<div class="field"><label for="adapterVersion">Adapter version</label><input id="adapterVersion" required maxlength="64" placeholder="1.0.0"></div>
<div class="field span2"><label for="capabilities">Capabilities (comma-separated registered IDs)</label><input id="capabilities" required placeholder="email.send,email.template"></div>
<div class="field span2"><label for="authModes">Authentication modes (comma-separated registered IDs)</label><input id="authModes" required placeholder="oauth2,api-key"></div>
<div class="field span2"><label for="schema">Configuration schema (supported JSON subset)</label><textarea id="schema" rows="7" required spellcheck="false">{ "type": "object", "properties": {} }</textarea></div>
</div><div id="versionInfo" class="help">New definitions start at version 1.</div>
<div class="actions"><button type="submit" id="save">Create definition</button><button type="button" class="secondary" id="new">New</button><button type="button" class="secondary" id="activate" hidden>Activate</button><button type="button" class="secondary" id="suspend" hidden>Suspend</button><button type="button" class="danger" id="deprecate" hidden>Deprecate</button></div></form><div id="editorStatus" class="status" role="status" aria-live="polite"></div>
</section></div>
<footer>Changes use optimistic version checks and the platform audit ledger. Provider-key deletion is intentionally unsupported.</footer>
</main>
<script>
(()=>{
 const $=id=>document.getElementById(id),api="/platform/admin/provider-definitions",media="application/vnd.eper.v1+json";
 let token="",selected=null,rows=[];
 const status=(id,msg,kind="")=>{const el=$(id);el.textContent=msg;el.className="status "+kind;};
 const headers=()=>({"accept":media,"content-type":"application/json","authorization":"Bearer "+token});
 async function call(path,method="GET",body){
  const response=await fetch(api+path,{method,headers:headers(),...(body===undefined?{}:{body:JSON.stringify(body)})});
  let payload={};try{payload=await response.json();}catch{}
  const data=payload.data||payload;
  if(!response.ok)throw new Error(data.error||"Request failed ("+response.status+")");
  return data;
 }
 function connect(){token=$("token").value.trim();if(!token){status("connection","Enter a Product Admin credential.","error");return;}refresh();}
 function reset(){selected=null;$("editor").reset();$("providerKey").disabled=false;$("schema").value='{ "type": "object", "properties": {} }';$("formTitle").textContent="Create provider definition";$("save").textContent="Create definition";$("versionInfo").textContent="New definitions start at version 1.";["activate","suspend","deprecate"].forEach(id=>$(id).hidden=true);status("editorStatus","");}
 function fill(p){selected=p;$("providerKey").value=p.providerKey;$("providerKey").disabled=true;$("displayName").value=p.displayName;$("adapterKey").value=p.adapterKey;$("adapterVersion").value=p.adapterVersion;$("capabilities").value=p.capabilities.join(", ");$("authModes").value=p.authModes.join(", ");$("schema").value=JSON.stringify(p.configurationSchema,null,2);$("formTitle").textContent="Edit "+p.displayName;$("save").textContent="Save version "+p.version+" changes";$("versionInfo").textContent="Current version "+p.version+" · updated "+p.updatedAt+" by "+p.updatedBy;$("activate").hidden=p.status==="ACTIVE"||p.status==="DEPRECATED";$("suspend").hidden=p.status!=="ACTIVE";$("deprecate").hidden=p.status==="DEPRECATED";status("editorStatus","Loaded "+p.providerKey+".");}
 function render(){const body=$("rows");body.replaceChildren();if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="empty";td.textContent="No provider definitions found.";tr.append(td);body.append(tr);return;}
  for(const p of rows){const tr=document.createElement("tr");tr.dataset.key=p.providerKey;const values=[p.displayName+" · "+p.providerKey,p.adapterKey,p.capabilities.join(", "),p.status,p.version];values.forEach((value,i)=>{const td=document.createElement("td");if(i===3){const pill=document.createElement("span");pill.className="pill "+p.status;pill.textContent=p.status;td.append(pill);}else td.textContent=String(value);tr.append(td);});tr.addEventListener("click",()=>fill(p));body.append(tr);}
 }
 async function refresh(){if(!token){status("connection","Enter a Product Admin credential.","error");return;}try{const result=await call("?limit=100");rows=result.providers||[];render();status("connection","Connected · "+rows.length+" provider definitions loaded.","success");}catch(e){status("connection",e.message,"error");}}
 function formBody(){let schema;try{schema=JSON.parse($("schema").value);}catch{throw new Error("Configuration schema must be valid JSON.");}
  const split=id=>$ (id).value.split(",").map(v=>v.trim()).filter(Boolean);
  return {displayName:$("displayName").value.trim(),adapterKey:$("adapterKey").value.trim(),adapterVersion:$("adapterVersion").value.trim(),capabilities:split("capabilities"),authModes:split("authModes"),configurationSchema:schema};
 }
 $("connect").addEventListener("click",connect);$("refresh").addEventListener("click",refresh);$("new").addEventListener("click",reset);
 $("editor").addEventListener("submit",async event=>{event.preventDefault();if(!token){status("editorStatus","Connect first.","error");return;}try{const body=formBody();if(selected){await call("/"+encodeURIComponent(selected.providerKey),"PATCH",{...body,expectedVersion:selected.version});status("editorStatus","Definition updated.","success");}else{await call("","POST",{providerKey:$("providerKey").value.trim(),...body});status("editorStatus","Definition created.","success");}await refresh();reset();}catch(e){status("editorStatus",e.message,"error");}});
 async function lifecycle(action){if(!selected)return;try{await call("/"+encodeURIComponent(selected.providerKey)+"/"+action,"POST",{expectedVersion:selected.version});status("editorStatus","Provider "+(action==="activate"?"activated":action==="suspend"?"suspended":"deprecated")+".","success");await refresh();const updated=rows.find(p=>p.providerKey===selected.providerKey);if(updated)fill(updated);}catch(e){status("editorStatus",e.message,"error");}}
 $("activate").addEventListener("click",()=>lifecycle("activate"));$("suspend").addEventListener("click",()=>lifecycle("suspend"));$("deprecate").addEventListener("click",()=>{if(confirm("Deprecate this provider? New connections and bindings should be blocked."))lifecycle("deprecate");});
})();
</script></body></html>`;

export function isProviderCatalogueUiRequest(request: IncomingMessage): boolean {
  return request.method === "GET" && (request.url ?? "").split("?")[0] === "/admin/provider-catalogue-ui";
}
