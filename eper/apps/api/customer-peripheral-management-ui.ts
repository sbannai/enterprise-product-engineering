/** Customer-facing, application-scoped Peripheral Management UI. No device I/O occurs until an authorized operator explicitly activates a configured peripheral. */
export const customerPeripheralManagementUiHtml = String.raw\`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER · Peripheral Management</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#183638;background:#f5f9f8;--line:#dce9e6;--muted:#607879;--navy:#123f43;--teal:#167c80;--card:#fff}*{box-sizing:border-box}body{margin:0}header{background:linear-gradient(120deg,#123f43,#1b6265);color:#fff;padding:24px clamp(16px,4vw,42px)}header h1{margin:0;font-size:23px}header p{margin:6px 0 0;color:#d2e5e1;font-size:13px}main{max-width:1160px;margin:26px auto;padding:0 16px}.panel{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:20px;margin-bottom:16px;box-shadow:0 8px 24px #14233b08}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px;min-width:0}.field label{font-size:12px;font-weight:750;color:#526b6c}input,select{width:100%;min-width:0;min-height:42px;padding:10px;border:1px solid #c7d1df;border-radius:8px;background:#fff;color:#183638;font:inherit}button{border:0;border-radius:8px;padding:10px 14px;min-height:40px;font:inherit;font-weight:750;cursor:pointer;background:var(--teal);color:#fff}button.secondary{background:#e7f0ee;color:#244c4d}button:disabled{opacity:.45;cursor:not-allowed}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.help{color:var(--muted);font-size:12px;line-height:1.55}.status{min-height:22px;margin-top:12px;color:var(--muted);font-size:12px}.status.error{color:#b42318}.status.ok{color:#13795b}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:760px;margin-top:10px;font-size:13px}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid #e8efed;vertical-align:middle}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.pill{display:inline-flex;border-radius:99px;padding:4px 8px;background:#e7f5ef;color:#13795b;font-size:11px;font-weight:800}.pill.pending{background:#fff2d8;color:#805000}.empty{padding:22px;text-align:center;color:var(--muted);border:1px dashed #cbd9d5;border-radius:10px}.topline{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.rowactions{display:flex;gap:6px;flex-wrap:wrap}.rowactions button{font-size:11px;padding:7px 9px;min-height:32px}.notice{background:#f0f7f6;border:1px solid #d8e9e5;border-radius:10px;padding:12px;color:#456364;font-size:12px;line-height:1.5;margin-top:12px}
@media(max-width:720px){.grid{grid-template-columns:1fr}.panel{padding:15px}}
</style></head><body>
<header><h1>Customer Application · Peripheral Management</h1><p>Register, configure and explicitly activate application-scoped devices</p></header>
<main>
<section class="panel"><h2>Application workspace</h2><p class="help">All records and operations are scoped to the selected customer application and re-authorized by EPER. Sign in with your organization before managing peripherals.</p>
<div class="grid"><div class="field"><label for="application">Application ID</label><input id="application" placeholder="Your application ID" autocomplete="off"></div></div>
<div class="actions"><a href="/customer/auth/oidc/start?returnTo=%2Fcustomer%2Fperipherals%2Fui" style="display:inline-flex;align-items:center;padding:10px 14px;border-radius:8px;background:#e7f0ee;color:#244c4d;text-decoration:none;font-weight:750">Sign in with your organization</a><button id="load">Load peripherals</button></div>
<div id="status" class="status" role="status" aria-live="polite">Enter an application ID and load its peripheral registrations.</div>
<div class="notice"><strong>Safety rule:</strong> registration and configuration never connect to hardware. Only the explicit Activate action can request a connection, and this build currently exposes the synthetic simulator adapter only. No real device credentials or cloud resources are provisioned.</div></section>
<section class="panel"><div class="topline"><h2>Registered peripherals</h2><button id="refresh" class="secondary">Refresh</button></div><div id="list"><div class="empty">Load an application to view its peripherals.</div></div></section>
<section class="panel"><h2>Register a peripheral</h2><div class="grid">
<div class="field"><label for="kind">Peripheral type</label><select id="kind"><option value="barcode_scanner">Barcode scanner</option><option value="qr_reader">QR reader</option><option value="sensor">Sensor</option><option value="rfid_nfc">RFID / NFC reader</option><option value="printer">Printer</option><option value="weighing_scale">Weighing scale</option><option value="custom">Custom</option></select></div>
<div class="field"><label for="displayName">Display name</label><input id="displayName" maxlength="160" placeholder="e.g. Front desk QR scanner"></div>
</div><div class="actions"><button id="register">Register peripheral</button></div></section>
<section class="panel"><h2>Configure selected peripheral</h2><p class="help">Select a registered peripheral from the list, then save its exact adapter identity. The initial implementation permits the synthetic simulator adapter only.</p>
<div class="grid">
<div class="field"><label for="peripheralId">Peripheral ID</label><input id="peripheralId" readonly placeholder="Select a peripheral above"></div>
<div class="field"><label for="adapterKey">Adapter key</label><input id="adapterKey" value="synthetic.simulator" readonly></div>
<div class="field"><label for="adapterVersion">Adapter version</label><input id="adapterVersion" value="1.0.0" readonly></div>
</div><div class="actions"><button id="configure">Save configuration</button></div></section>
</main>
<script>
(()=>{"use strict";
const $=id=>document.getElementById(id);let peripherals=[];
const cookieValue=name=>{const prefix=name+"=";for(const part of document.cookie.split(";")){const value=part.trim();if(value.startsWith(prefix))return decodeURIComponent(value.slice(prefix.length));}return "";};
const app=()=>$("application").value.trim();
const root=()=>"/customer/applications/"+encodeURIComponent(app())+"/peripherals";
const status=(message,kind="")=>{$("status").textContent=message;$("status").className="status "+kind;};
async function api(path,method="GET",body){
 const headers={accept:"application/vnd.eper.v1+json"};
 if(body){headers["content-type"]="application/json";headers["x-csrf-token"]=cookieValue("__Host-eper_csrf");}
 const response=await fetch(path,{method,credentials:"same-origin",headers,...(body?{body:JSON.stringify(body)}:{})});
 const payload=await response.json().catch(()=>({error:"invalid_response"}));
 if(!response.ok)throw new Error(payload.error?.message||payload.error||("HTTP "+response.status));
 return payload.data||payload;
}
function selectPeripheral(id){const p=peripherals.find(x=>x.peripheralId===id);$("peripheralId").value=p?.peripheralId||"";}
function render(){
 const rootNode=$("list");rootNode.replaceChildren();
 if(!peripherals.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No peripherals registered for this application.";rootNode.append(empty);return;}
 const table=document.createElement("table"),head=document.createElement("thead"),tr=document.createElement("tr");
 ["Name","Type","Peripheral ID","Adapter","Lifecycle","Version","Actions"].forEach(label=>{const th=document.createElement("th");th.textContent=label;tr.append(th);});head.append(tr);table.append(head);
 const body=document.createElement("tbody");
 peripherals.forEach(p=>{
  const row=document.createElement("tr");
  [p.displayName,p.kind,p.peripheralId,(p.adapterKey||"Not configured")+(p.adapterVersion?" @ "+p.adapterVersion:""),p.status,String(p.version)].forEach((value,index)=>{const td=document.createElement("td");if(index===4){const pill=document.createElement("span");pill.className="pill"+(["REGISTERED","CONFIGURED","DISCONNECTING","DEGRADED","OFFLINE"].includes(value)?" pending":"");pill.textContent=value;td.append(pill);}else td.textContent=value;row.append(td);});
  const actions=document.createElement("td"),wrap=document.createElement("div");wrap.className="rowactions";
  const choose=document.createElement("button");choose.className="secondary";choose.textContent="Configure";choose.addEventListener("click",()=>selectPeripheral(p.peripheralId));wrap.append(choose);
  if(["CONFIGURED","OFFLINE","DEGRADED"].includes(p.status)){const activate=document.createElement("button");activate.textContent="Activate";activate.addEventListener("click",()=>transition(p,"activate"));wrap.append(activate);}
  if(["ACTIVE","DEGRADED","OFFLINE"].includes(p.status)){const suspend=document.createElement("button");suspend.className="secondary";suspend.textContent="Suspend";suspend.addEventListener("click",()=>transition(p,"suspend"));wrap.append(suspend);}
  actions.append(wrap);row.append(actions);body.append(row);
 });
 table.append(body);const wrap=document.createElement("div");wrap.className="tablewrap";wrap.append(table);rootNode.append(wrap);
}
async function load(){if(!app())throw new Error("Enter an application ID.");const data=await api(root());peripherals=data.peripherals||[];render();status("Loaded "+peripherals.length+" peripheral(s).","ok");}
async function register(){if(!app())throw new Error("Enter an application ID.");const displayName=$("displayName").value.trim();if(!displayName)throw new Error("Enter a display name.");const data=await api(root(),"POST",{kind:$("kind").value,displayName});$("displayName").value="";selectPeripheral(data.peripheral?.peripheralId);status("Peripheral registered. No device connection was attempted.","ok");await load();}
async function configure(){const id=$("peripheralId").value;if(!id)throw new Error("Select a registered peripheral first.");const p=peripherals.find(x=>x.peripheralId===id);if(!p)throw new Error("Refresh the list and select a current peripheral.");await api(root()+"/"+encodeURIComponent(id)+"/configure","POST",{expectedVersion:p.version,configuration:{adapterKey:"synthetic.simulator",adapterVersion:"1.0.0",settings:{}}});status("Configuration saved. Device remains disconnected until you explicitly activate it.","ok");await load();}
async function transition(p,action){if(!confirm(action==="activate"?"Activate this configured peripheral? This is the explicit step that permits its adapter to connect.":"Suspend this peripheral and disconnect its adapter?"))return;await api(root()+"/"+encodeURIComponent(p.peripheralId)+"/"+action,"POST",{expectedVersion:p.version});status("Peripheral "+action+" request completed.","ok");await load();}
$("load").addEventListener("click",async()=>{try{await load();}catch(e){status(e.message,"error");}});
$("refresh").addEventListener("click",async()=>{try{await load();}catch(e){status(e.message,"error");}});
$("register").addEventListener("click",async()=>{try{await register();}catch(e){status(e.message,"error");}});
$("configure").addEventListener("click",async()=>{try{await configure();}catch(e){status(e.message,"error");}});
})();
</script></body></html>\`;

export function isCustomerPeripheralManagementUiRequest(request: { method?: string; url?: string }): boolean {
 return request.method === "GET" && new URL(request.url ?? "/", "http://localhost").pathname === "/customer/peripherals/ui";
}