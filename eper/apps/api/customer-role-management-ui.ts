/** Customer Admin role management workspace. Mutations call the session-authenticated API. */
export const customerRoleManagementUiHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER · Customer role management</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#17243b;background:#f4f7fb}*{box-sizing:border-box}body{margin:0}
header{background:#142544;color:#fff;padding:22px clamp(16px,4vw,42px)}header h1{margin:0;font-size:22px}header p{margin:5px 0 0;color:#cbd5e5;font-size:13px}
main{max-width:1120px;margin:28px auto;padding:0 16px}.panel{background:#fff;border:1px solid #dfe6ef;border-radius:14px;padding:20px;margin-bottom:16px;box-shadow:0 5px 20px #16294b08}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px}.field label{font-size:12px;font-weight:750;color:#526078}
input,select{width:100%;min-width:0;min-height:42px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#17243b;font:inherit}
button,.link{border:0;border-radius:8px;padding:10px 14px;min-height:42px;font:inherit;font-weight:700;cursor:pointer;background:#315efb;color:white;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
button.secondary{background:#e9eef8;color:#263b61}button.danger{background:#fff0ef;color:#b42318}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
.help{color:#68778d;font-size:12px;line-height:1.5}.status{min-height:22px;margin-top:12px;color:#68778d;font-size:12px}.status.error{color:#b42318}.status.ok{color:#13795b}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}th,td{text-align:left;padding:12px 9px;border-bottom:1px solid #e8edf4;vertical-align:middle}th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#68778d}
.pill{display:inline-flex;border-radius:99px;padding:4px 8px;background:#e9f7f0;color:#13795b;font-size:11px;font-weight:750}.pill.revoked{background:#f1f3f6;color:#68778d}.empty{padding:24px;text-align:center;color:#68778d}
@media(max-width:700px){.grid{grid-template-columns:1fr}.panel{padding:15px}table{display:block;overflow-x:auto;white-space:nowrap}}
</style></head><body>
<header><h1>Customer Admin · Role management</h1><p>Application-scoped access · Durable assignments · Audited changes</p></header>
<main>
<section class="panel"><h2>Connect your customer session</h2><p class="help">Sign in with your organization. Only an active Customer Admin with the durable access:manage permission can view or change role assignments.</p>
<div class="grid"><div class="field"><label for="application">Application ID</label><input id="application" placeholder="Your application ID" autocomplete="off"></div></div>
<div class="actions"><a class="link" href="/customer/auth/oidc/start?returnTo=%2Fcustomer%2Frole-management%2Fui">Sign in with your organization</a><button id="load" class="secondary">Load role directory</button></div>
<div id="status" class="status" role="status" aria-live="polite">Sign in, enter an application ID, and load its role directory.</div></section>
<section class="panel"><h2>Assign a role</h2><p class="help">The target actor must already have an active membership in this same tenant and application. Elevated permissions cannot be delegated.</p>
<div class="grid"><div class="field"><label for="actor">Target actor ID</label><input id="actor" placeholder="actor-id"></div><div class="field"><label for="role">Permitted role</label><select id="role"><option value="">Load roles first</option></select></div><div class="field"><label for="version">Expected assignment version</label><input id="version" type="number" min="0" step="1" value="0"></div></div>
<div class="actions"><button id="grant">Assign role</button></div><div class="help">Use version 0 for a first-time assignment. Existing assignments require their current version.</div></section>
<section class="panel"><h2>Role assignments &amp; history</h2><p class="help">The table includes revoked history. Refresh after every change to see the durable state.</p>
<div id="directory"><div class="empty">No directory loaded.</div></div></section>
</main>
<script>
(() => {
 const $=id=>document.getElementById(id); let roles=[]; let assignments=[];
 const cookieValue=name=>{const prefix=name+"=";for(const part of document.cookie.split(";")){const v=part.trim();if(v.startsWith(prefix))return decodeURIComponent(v.slice(prefix.length));}return "";};
 const endpoint=()=>"/customer/applications/"+encodeURIComponent($("application").value.trim())+"/workflow-role-delegations";
 const status=(message,kind="")=>{$("status").textContent=message;$("status").className="status "+kind;};
 async function api(method="GET",body){
   const headers={accept:"application/vnd.eper.v1+json"};
   if(body){headers["content-type"]="application/json";headers["x-csrf-token"]=cookieValue("__Host-eper_csrf");}
   const response=await fetch(endpoint(),{method,credentials:"same-origin",headers,...(body?{body:JSON.stringify(body)}:{})});
   const data=await response.json().catch(()=>({error:"invalid_response"}));
   if(!response.ok)throw new Error(data.error?.message||data.error||("HTTP "+response.status));
   return data.data||data;
 }
 function render(){
   const root=$("directory");root.replaceChildren();
   if(!assignments.length){const p=document.createElement("div");p.className="empty";p.textContent="No role assignment history for this application.";root.append(p);return;}
   const table=document.createElement("table"),thead=document.createElement("thead"),head=document.createElement("tr");
   ["Actor","Role","Status","Version","Granted by","Updated"].forEach(label=>{const th=document.createElement("th");th.textContent=label;head.append(th);});
   thead.append(head);table.append(thead);const tbody=document.createElement("tbody");
   assignments.forEach(a=>{const tr=document.createElement("tr");
     [a.actorId,a.roleId,a.status,String(a.version),a.assignedBy||"—",a.updatedAt||a.assignedAt||"—"].forEach((v,i)=>{const td=document.createElement("td");if(i===2){const pill=document.createElement("span");pill.className="pill"+(v==="revoked"?" revoked":"");pill.textContent=v;td.append(pill);}else td.textContent=v;tr.append(td);});
     const action=document.createElement("td");
     if(a.status==="active"){const b=document.createElement("button");b.className="danger";b.textContent="Revoke";b.addEventListener("click",()=>revoke(a));action.append(b);}
     else action.textContent="—";
     tr.append(action);tbody.append(tr);
   });
   const th=document.createElement("th");th.textContent="Action";head.append(th);table.append(tbody);root.append(table);
 }
 async function load(){
   const app=$("application").value.trim();if(!app)throw new Error("Enter an application ID.");
   const data=await api("GET");assignments=data.assignments||[];roles=data.roles||[];
   const select=$("role");select.replaceChildren();roles.forEach(r=>{const o=document.createElement("option");o.value=r.roleId;o.textContent=r.name+" ("+r.roleId+")";select.append(o);});
   if(!roles.length){const o=document.createElement("option");o.value="";o.textContent="No active roles available";select.append(o);}
   render();status("Loaded "+assignments.length+" assignment record(s) and "+roles.length+" active role definition(s).","ok");
 }
 async function grant(){
   const actorId=$("actor").value.trim(),roleId=$("role").value,expectedVersion=Number($("version").value);
   if(!actorId||!roleId||!Number.isSafeInteger(expectedVersion)||expectedVersion<0)throw new Error("Enter a target actor, permitted role and valid version.");
   await api("POST",{actorId,roleId,expectedVersion});status("Role assigned. Refreshing durable assignment history…","ok");await load();
 }
 async function revoke(a){
   if(!confirm("Revoke "+a.roleId+" from "+a.actorId+"? The change takes effect on the next authorization check."))return;
   try{await api("DELETE",{actorId:a.actorId,roleId:a.roleId,expectedVersion:a.version});status("Role revoked. Refreshing assignment history…","ok");await load();}
   catch(e){status(e.message,"error");}
 }
 $("load").addEventListener("click",async()=>{try{await load();}catch(e){status(e.message,"error");}});
 $("grant").addEventListener("click",async()=>{try{await grant();}catch(e){status(e.message,"error");}});
})();
</script></body></html>`;

export function isCustomerRoleManagementUiRequest(request: { method?: string; url?: string }): boolean {
  return request.method === "GET" && new URL(request.url ?? "/", "http://localhost").pathname === "/customer/role-management/ui";
}
