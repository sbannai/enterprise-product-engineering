import type { IncomingMessage } from "node:http";

/** Same-origin provisioning console; credentials remain in memory and are never persisted. */
export const adminActorApplicationAssignmentUiHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER · Actor Application Access</title>
<style>
:root{color-scheme:light;--ink:#17233b;--muted:#64728a;--line:#dfe5ee;--bg:#f4f7fb;--blue:#315ff4;--red:#b42318}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Inter,system-ui,sans-serif}
header{background:#142544;color:#fff;padding:22px clamp(16px,4vw,42px)}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:#cbd5e5}
main{max-width:980px;margin:28px auto;padding:0 16px}.card{background:white;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.field{display:grid;gap:5px}.field label{font-size:12px;color:var(--muted);font-weight:700}
input{width:100%;min-width:0;padding:11px;border:1px solid #cbd5e1;border-radius:9px;font:inherit}button{border:0;border-radius:9px;padding:10px 14px;font:inherit;font-weight:700;background:var(--blue);color:#fff;cursor:pointer}button.secondary{background:#e9eef8;color:#263b61}button.danger{background:#fff0ef;color:var(--red)}
.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.status{min-height:22px;margin-top:12px;color:var(--muted);font-size:12px}.status.error{color:var(--red)}.status.ok{color:#13795b}
code{background:#f1f4f9;padding:2px 5px;border-radius:5px}.help{color:var(--muted);font-size:12px}.result{padding:12px;border:1px solid var(--line);border-radius:9px;margin-top:10px;display:flex;justify-content:space-between;gap:10px;align-items:center}
@media(max-width:620px){.grid{grid-template-columns:1fr}.card{padding:15px}}
</style></head><body>
<header><h1>Actor & Application Access</h1><p>Tenant-scoped provisioning · Audited grants and revocations</p></header>
<main>
<section class="card"><h2>Connect administrator session</h2><p class="help">Enter the server-issued administrator bearer token. It is held only in this page's memory and is not written to browser storage.</p>
<div class="field"><label for="token">Administrator bearer token</label><input id="token" type="password" autocomplete="off"></div>
<div class="actions"><button id="connect">Connect & load</button></div><div id="connection" class="status" role="status"></div></section>
<section class="card"><h2>Application assignment</h2><div class="grid">
<div class="field"><label for="actor">Actor ID</label><input id="actor" placeholder="actor-id"></div>
<div class="field"><label for="app">Application ID</label><input id="app" placeholder="application-id"></div>
<div class="field"><label for="version">Expected version</label><input id="version" type="number" min="0" step="1" value="0"></div>
</div><div class="actions"><button id="load" class="secondary">Load actor assignments</button><button id="grant">Grant access</button><button id="revoke" class="danger">Revoke access</button></div>
<div id="operation" class="status" role="status"></div><div id="assignments"></div></section>
<p class="help">Access is granted only when the application is assigned to the administrator's tenant. Changes require the current assignment version and are recorded with an audit event.</p>
</main>
<script>
(() => {
  const $ = id => document.getElementById(id);
  let token = "";
  const endpoint = "/admin/actor-application-assignments";
  const headers = () => ({ authorization: "Bearer " + token, "content-type": "application/json" });
  function status(id, message, kind) { const el=$(id); el.textContent=message; el.className="status "+(kind||""); }
  async function call(url, options={}) {
    const response=await fetch(url,{...options,headers:{...headers(),...(options.headers||{})}});
    const body=await response.json().catch(()=>({error:"invalid_response"}));
    if(!response.ok) throw new Error(body.error||("HTTP_"+response.status));
    return body;
  }
  async function load() {
    const actor=$("actor").value.trim();
    if(!actor) throw new Error("Enter an actor ID");
    const data=await call(endpoint+"?actorId="+encodeURIComponent(actor));
    $("assignments").replaceChildren();
    if(!data.assignments.length){const p=document.createElement("p");p.className="help";p.textContent="No active application assignments."; $("assignments").append(p);}
    for(const assignment of data.assignments){const row=document.createElement("div");row.className="result";const label=document.createElement("strong");label.textContent=assignment.applicationId;const select=document.createElement("button");select.className="secondary";select.type="button";select.textContent="Version "+assignment.version;select.addEventListener("click",()=>{$("app").value=assignment.applicationId;$("version").value=String(assignment.version);});row.append(label,select);$("assignments").append(row);}
    status("operation","Loaded "+data.assignments.length+" active assignment(s). Select a version to prepare a revocation.","ok");
  }
  async function change(method) {
    const actorId=$("actor").value.trim(), applicationId=$("app").value.trim(), expectedVersion=Number($("version").value);
    if(!actorId||!applicationId||!Number.isSafeInteger(expectedVersion)||expectedVersion<0) throw new Error("Enter actor, application and a valid expected version");
    const data=await call(endpoint,{method,body:JSON.stringify({actorId,applicationId,expectedVersion})});
    $("version").value=String(data.assignment.version);
    await load();
    status("operation",method==="POST"?"Application access granted.":"Application access revoked.","ok");
  }
  $("connect").addEventListener("click",async()=>{token=$("token").value.trim();if(!token){status("connection","Administrator token is required.","error");return;}try{await load();status("connection","Administrator session connected.","ok");}catch(e){token="";status("connection",e.message,"error");}});
  $("load").addEventListener("click",async()=>{try{await load();}catch(e){status("operation",e.message,"error");}});
  $("grant").addEventListener("click",async()=>{try{await change("POST");}catch(e){status("operation",e.message,"error");}});
  $("revoke").addEventListener("click",async()=>{try{await change("DELETE");}catch(e){status("operation",e.message,"error");}});
})();
</script></body></html>`;

export function isAdminActorApplicationAssignmentUiRequest(request: IncomingMessage): boolean {
  return request.method === "GET" && new URL(request.url ?? "/", "http://localhost").pathname === "/admin/actor-application-assignments/ui";
}
