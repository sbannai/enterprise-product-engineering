/** Customer Admin provider connection workspace. Uses the durable customer browser session; no bearer tokens or secrets are stored in the page. */
export const customerProviderConnectionsUiHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER · Provider connections</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#183638;background:#f6faf9;--line:#dce9e6;--muted:#607879;--navy:#123f43;--blue:#167c80;--card:#fff}*{box-sizing:border-box}body{margin:0}header{background:linear-gradient(120deg,#123f43,#1b6265);color:#fff;padding:22px clamp(16px,4vw,42px)}header h1{margin:0;font-size:22px}header p{margin:5px 0 0;color:#d2e5e1;font-size:13px}main{max-width:1180px;margin:26px auto;padding:0 16px}.panel{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:20px;margin-bottom:16px;box-shadow:0 8px 24px #14233b08}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px;min-width:0}.field label{font-size:12px;font-weight:750;color:#526b6c}input,select{width:100%;min-width:0;min-height:42px;padding:10px;border:1px solid #c7d1df;border-radius:8px;background:#fff;color:#183638;font:inherit}button,.link{border:0;border-radius:8px;padding:10px 14px;min-height:42px;font:inherit;font-weight:750;cursor:pointer;background:var(--blue);color:white;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}button.secondary{background:#e7f0ee;color:#244c4d}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.help{color:var(--muted);font-size:12px;line-height:1.55}.status{min-height:22px;margin-top:12px;color:var(--muted);font-size:12px}.status.error{color:#b42318}.status.ok{color:#13795b}.catalogue{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.provider{border:1px solid var(--line);border-radius:11px;padding:12px}.provider strong{display:block}.provider small{color:var(--muted)}.caps{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.caps label{font-size:12px;display:flex;align-items:center;gap:5px}.caps input{width:auto;min-height:0}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:620px;margin-top:10px;font-size:13px}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid #e8efed}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.pill{display:inline-flex;border-radius:99px;padding:4px 8px;background:#e7f5ef;color:#13795b;font-size:11px;font-weight:800}.pill.pending{background:#fff2d8;color:#805000}.empty{padding:22px;text-align:center;color:var(--muted);border:1px dashed #cbd9d5;border-radius:10px}.topline{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
@media(max-width:720px){.grid,.catalogue{grid-template-columns:1fr}.panel{padding:15px}}
</style></head><body>
<header><h1>Customer Admin · Provider connections</h1><p>Choose approved providers · Configure an application connection · Bind capabilities · Validate safely</p></header>
<main>
<section class="panel"><h2>Application workspace</h2><p class="help">Sign in with your organization. Every connection is scoped to this application and protected by current role permissions. A customer-wide default can be created by binding the same tenant connection to each intended application; this screen currently manages one application at a time.</p>
<div class="grid"><div class="field"><label for="application">Application ID</label><input id="application" placeholder="Your application ID" autocomplete="off"></div></div>
<div class="actions"><a class="link" href="/customer/auth/oidc/start?returnTo=%2Fcustomer%2Fprovider-connections%2Fui">Sign in with your organization</a><button id="load" class="secondary">Load providers &amp; connections</button></div>
<div id="status" class="status" role="status" aria-live="polite">Sign in, enter an application ID, and load the approved provider catalogue.</div></section>
<section class="panel"><h2>Approved provider catalogue</h2><p class="help">Only ACTIVE provider definitions are shown. Product Admin controls supported capabilities and authentication modes.</p><div id="catalogue" class="catalogue"><div class="empty">Load the application catalogue to continue.</div></div></section>
<section class="panel"><h2>Create connection for this application</h2><div class="grid">
<div class="field"><label for="provider">Provider</label><select id="provider"><option value="">Load providers first</option></select></div>
<div class="field"><label for="displayName">Connection name</label><input id="displayName" placeholder="e.g. Primary email account" maxlength="160"></div>
<div class="field"><label for="authMode">Authentication mode</label><select id="authMode"><option value="">Choose provider first</option></select></div>
<div class="field"><label for="environment">Environment</label><select id="environment"><option value="development">Development</option><option value="sandbox">Sandbox</option></select></div>
</div><div class="help" style="margin-top:10px">This pilot creates synthetic credential references only. No real secrets are entered, stored in the browser, or dispatched to external providers.</div>
<div id="capabilities" class="caps"></div><div class="actions"><button id="create">Create &amp; bind to application</button></div></section>
<section class="panel"><div class="topline"><div><h2>Application connections</h2><p class="help">Connection metadata only. Secret references and credential material are never returned.</p></div><button id="refresh" class="secondary">Refresh</button></div>
<div id="connections"><div class="empty">No connections loaded.</div></div></section>
</main>
<script>
(() => {
 const $=id=>document.getElementById(id);let providers=[];let connections=[];
 const cookieValue=name=>{const prefix=name+"=";for(const part of document.cookie.split(";")){const v=part.trim();if(v.startsWith(prefix))return decodeURIComponent(v.slice(prefix.length));}return "";};
 const app=()=>$("application").value.trim();
 const root=()=>"/customer/applications/"+encodeURIComponent(app());
 const status=(message,kind="")=>{$("status").textContent=message;$("status").className="status "+kind;};
 async function api(path,method="GET",body){
  const headers={accept:"application/vnd.eper.v1+json"};
  if(body){headers["content-type"]="application/json";headers["x-csrf-token"]=cookieValue("__Host-eper_csrf");}
  const response=await fetch(path,{method,credentials:"same-origin",headers,...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json().catch(()=>({error:"invalid_response"}));
  if(!response.ok)throw new Error(payload.error?.message||payload.error||("HTTP "+response.status));
  return payload.data||payload;
 }
 function renderCatalogue(){
  const rootNode=$("catalogue");rootNode.replaceChildren();
  const select=$("provider");select.replaceChildren();
  providers.forEach(p=>{
   const option=document.createElement("option");option.value=p.providerKey;option.textContent=p.displayName+" · "+p.providerKey;select.append(option);
   const card=document.createElement("div");card.className="provider";
   const title=document.createElement("strong");title.textContent=p.displayName;card.append(title);
   const key=document.createElement("small");key.textContent=p.providerKey;card.append(key);
   const caps=document.createElement("div");caps.className="help";caps.textContent="Capabilities: "+p.capabilities.join(", ");card.append(caps);rootNode.append(card);
  });
  if(!providers.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No active providers are currently available.";rootNode.append(empty);const option=document.createElement("option");option.value="";option.textContent="No active providers";select.append(option);}
  select.addEventListener("change",renderAuthModes);renderAuthModes();
 }
 function renderAuthModes(){
  const p=providers.find(x=>x.providerKey===$("provider").value);const select=$("authMode");select.replaceChildren();
  (p?.authModes||[]).forEach(mode=>{const o=document.createElement("option");o.value=mode;o.textContent=mode;select.append(o);});
  if(!p){const o=document.createElement("option");o.value="";o.textContent="Choose provider first";select.append(o);}
  const box=$("capabilities");box.replaceChildren();
  (p?.capabilities||[]).forEach(cap=>{const label=document.createElement("label"),input=document.createElement("input");input.type="checkbox";input.value=cap;input.checked=true;label.append(input,document.createTextNode(cap));box.append(label);});
 }
 function renderConnections(){
  const rootNode=$("connections");rootNode.replaceChildren();
  if(!connections.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No connections are bound to this application.";rootNode.append(empty);return;}
  const table=document.createElement("table"),head=document.createElement("thead"),tr=document.createElement("tr");
  ["Connection","Provider","Environment","Status","Capabilities"].forEach(x=>{const th=document.createElement("th");th.textContent=x;tr.append(th);});head.append(tr);table.append(head);
  const body=document.createElement("tbody");
  connections.forEach(c=>{const row=document.createElement("tr");[c.displayName,c.providerKey,c.environment,c.status+" / "+c.bindingStatus,(c.allowedCapabilities||[]).join(", ")].forEach((v,i)=>{const td=document.createElement("td");if(i===3){const pill=document.createElement("span");pill.className="pill"+(String(v).includes("PENDING")?" pending":"");pill.textContent=v;td.append(pill);}else td.textContent=v;row.append(td);});body.append(row);});
  table.append(body);const wrap=document.createElement("div");wrap.className="tablewrap";wrap.append(table);rootNode.append(wrap);
 }
 async function load(){
  if(!app())throw new Error("Enter an application ID.");
  const [catalogue,connectionData]=await Promise.all([api(root()+"/provider-catalogue"),api(root()+"/provider-connections")]);
  providers=catalogue.providers||[];connections=connectionData.connections||[];
  renderCatalogue();renderConnections();status("Loaded "+providers.length+" active provider(s) and "+connections.length+" application connection(s).","ok");
 }
 async function create(){
  const p=providers.find(x=>x.providerKey===$("provider").value);
  const allowedCapabilities=[...$("capabilities").querySelectorAll("input:checked")].map(x=>x.value);
  if(!p||!$("displayName").value.trim()||!$("authMode").value||!allowedCapabilities.length)throw new Error("Choose a provider, connection name, authentication mode and at least one capability.");
  const secretReference="synthetic://customer/"+crypto.randomUUID();
  const result=await api(root()+"/provider-connections","POST",{providerKey:p.providerKey,displayName:$("displayName").value.trim(),authMode:$("authMode").value,secretReference,environment:$("environment").value,allowedCapabilities});
  $("displayName").value="";status("Connection created and bound. Validation is still required before use.","ok");await load();
 }
 $("load").addEventListener("click",async()=>{try{await load();}catch(e){status(e.message,"error");}});
 $("refresh").addEventListener("click",async()=>{try{await load();}catch(e){status(e.message,"error");}});
 $("create").addEventListener("click",async()=>{try{await create();}catch(e){status(e.message,"error");}});
})();
</script></body></html>`;

export function isCustomerProviderConnectionsUiRequest(request: { method?: string; url?: string }): boolean {
  return request.method === "GET" && new URL(request.url ?? "/", "http://localhost").pathname === "/customer/provider-connections/ui";
}
