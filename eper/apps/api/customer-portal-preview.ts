/**
 * Customer portal navigation prototype.
 * Static design preview only: it is not an authenticated customer session and makes no API calls.
 */
export const customerPortalPreviewHtml = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER Customer Workspace — Preview</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#17243b;background:#f4f7fb}
*{box-sizing:border-box}body{margin:0}.layout{min-height:100vh;display:grid;grid-template-columns:245px 1fr}
aside{background:#101c33;color:#e8eef9;padding:24px 16px}.brand{font-weight:800;font-size:19px;padding:4px 10px 26px}.brand span{color:#8eabff}.caption{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#9eacc4;padding:10px}
nav{display:grid;gap:6px}nav button{border:0;background:transparent;color:#cbd5e5;padding:12px;border-radius:9px;text-align:left;font:inherit;cursor:pointer;min-height:44px}nav button[aria-current=page],nav button:hover{background:#263653;color:white}nav button:focus-visible,.card button:focus-visible,.support-actions button:focus-visible{outline:3px solid #8eabff;outline-offset:2px}.nav-icon{display:inline-block;width:28px;color:#9eb7ff}
main{padding:30px;min-width:0}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid #dfe6f0;padding-bottom:20px}.eyebrow{font-size:12px;color:#69768b}.top h1{margin:5px 0 0;font-size:26px}.preview{background:#fff3d7;color:#815200;border:1px solid #f0d69b;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700}
.intro{padding:28px 0 18px}.intro h2{font-size:25px;margin:0 0 8px}.intro p{color:#647188;margin:0;max-width:720px;line-height:1.6}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{background:white;border:1px solid #e0e6ef;border-radius:16px;padding:22px;box-shadow:0 5px 20px #16294b08}.card .symbol{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:#edf2ff;color:#315efb;font-size:22px}.card h3{margin:16px 0 7px}.card p{color:#647188;line-height:1.5;margin:0 0 16px}.card button{border:0;background:#315efb;color:white;border-radius:9px;padding:10px 13px;font:inherit;font-weight:700;cursor:pointer}.subnav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 20px}.subnav span{background:#e9eef8;border-radius:999px;padding:7px 10px;font-size:12px;color:#33425b}
.note{margin-top:20px;background:#fff;border:1px solid #e0e6ef;border-radius:12px;padding:14px;color:#647188;font-size:13px;line-height:1.55}
.support-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(240px,.8fr);gap:16px;align-items:start}
.support-panel{background:#fff;border:1px solid #e0e6ef;border-radius:16px;padding:20px;min-width:0;box-shadow:0 5px 20px #16294b08}
.support-panel h3{margin:0 0 5px;font-size:17px}.support-panel .subcopy{font-size:12px;color:#647188;margin:0 0 16px}
.support-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}
.support-field{display:grid;gap:6px;margin:0 0 14px;min-width:0}.support-field.span-2{grid-column:1/-1}
.support-field label{font-size:12px;font-weight:750;color:#42516a}
.support-field input,.support-field select,.support-field textarea{width:100%;min-width:0;border:1px solid #cbd5e2;border-radius:9px;padding:11px;background:#fcfdff;color:#17243b;font:inherit}
.support-field input,.support-field select{min-height:42px}.support-field textarea{min-height:92px;resize:vertical}
.support-field input:focus,.support-field select:focus,.support-field textarea:focus{outline:3px solid #dbe5ff;border-color:#315efb}
.support-hint{font-size:11px;color:#718096;margin:0}
.support-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.support-actions button,.card button{min-height:44px}
.support-side{display:grid;gap:12px}.support-side-card{background:#fbfcff;border:1px solid #e0e6ef;border-radius:12px;padding:15px}
.support-side-card strong{font-size:13px}.support-side-card p,.support-side-card li{font-size:12px;color:#647188;line-height:1.55}.support-side-card p{margin:7px 0 0}.support-side-card ul{padding-left:18px;margin:9px 0 0}
.support-pill{display:inline-flex;border-radius:999px;padding:5px 9px;background:#edf2ff;color:#3150aa;font-size:11px;font-weight:750}
.support-ticket{border:1px solid #e0e6ef;border-radius:11px;padding:13px;margin-top:10px}
@media(max-width:700px){.support-layout{grid-template-columns:1fr}.support-grid{grid-template-columns:1fr}.support-field.span-2{grid-column:auto}.support-panel{padding:15px}}
@media(max-width:700px){.layout{grid-template-columns:minmax(0,1fr)}aside{padding:12px;min-width:0}.brand{padding:6px 8px 12px}nav{display:flex;gap:4px;overflow-x:auto;overscroll-behavior-x:contain;max-width:100%;padding:2px 0 6px}nav button{white-space:nowrap;padding:10px;flex:0 0 auto}main{padding:18px;min-width:0}.top{flex-wrap:wrap;align-items:flex-start}.preview{max-width:100%;white-space:normal;line-height:1.4}.cards{grid-template-columns:minmax(0,1fr)}.top h1{font-size:21px}}\n@media(max-width:380px){main{padding:12px}.intro{padding-top:20px}.intro h2{font-size:21px}.card{padding:16px}.support-panel{padding:12px}.support-actions{align-items:stretch}.support-actions button{width:100%}}
</style>
</head>
<body><div class="layout">
<aside><div class="brand">EPER <span>Customer</span></div><div class="caption">Customer workspace</div>
<nav aria-label="Customer navigation">
<button aria-current="page" data-view="home"><span class="nav-icon">⌂</span>Home</button>
<button data-view="help"><span class="nav-icon">?</span>Help Center</button>
<button data-view="growth"><span class="nav-icon">↗</span>Growth Hub</button>
<button data-view="apps"><span class="nav-icon">▦</span>My Applications</button>
<button data-view="tickets"><span class="nav-icon">✉</span>Tickets &amp; Feedback</button>
<button data-view="settings"><span class="nav-icon">⚙</span>Settings</button>
</nav></aside>
<main><div class="top"><div><div class="eyebrow">EPER / Customer workspace</div><h1 id="pageTitle">Your workspace</h1></div><span class="preview">NOT CONNECTED</span></div>
<section class="intro"><h2 id="headline">Welcome to your customer workspace</h2><p id="description">Your application tools, help resources, and growth resources belong in the customer experience—not in the administration workspace.</p></section>
<section class="support-panel" id="connectPanel" aria-label="Customer workspace connection" style="margin:16px 0"><h3>Connect your customer workspace</h3><p class="subcopy">Use the customer access credential issued by your administrator. This is credential-based API access, not a password login.</p><div class="support-field"><label for="customerCredential">Customer access credential</label><input id="customerCredential" type="password" autocomplete="off" spellcheck="false" placeholder="Paste customer access credential"></div><div class="support-actions"><button id="connectButton" type="button">Connect workspace</button><button id="disconnectButton" type="button" style="background:#52627a">Disconnect</button></div><p id="connectResult" class="support-hint" role="status" aria-live="polite"></p></section><p id="apiStatus" class="support-hint" role="status" aria-live="polite"></p>
<div class="cards" id="cards">
<article class="card"><div class="symbol">?</div><h3>Help Center</h3><p>Browse product guides, setup instructions, FAQs, and support pathways for your applications.</p><button data-view="help">Open Help Center →</button></article>
<article class="card"><div class="symbol">↗</div><h3>Growth Hub</h3><p>Access campaign resources, content planning, lead insights, and growth playbooks configured for your workspace.</p><button data-view="growth">Open Growth Hub →</button></article>
</div>
<div class="note" role="note">Customer workspace connection uses a server-issued bearer credential. Help and Growth content load only through tenant-scoped APIs. Ticket submission and other actions remain unavailable unless their APIs and application assignments are configured.</div>
</main></div>
<script>
(function(){
let bearerToken="";
let enabledModules=new Set();
const apiStatus=document.getElementById("apiStatus");
const cards=document.getElementById("cards");
const nav=document.querySelector("nav");
const content={
home:{title:"Your workspace",headline:"Welcome to your customer workspace",description:"Your applications, Help Center, Growth Hub and support resources—scoped to your authenticated customer account.",cards:[["?","Help Center","Browse tenant-enabled guides and setup instructions.","help"],["↗","Growth Hub","Open your tenant's growth resources and content.","growth"],["✉","Tickets & Feedback","Submit a support ticket for an assigned application.","tickets"]]},
help:{title:"Help Center",headline:"Find answers and get support",description:"Published help content available to your customer tenant.",cards:[]},
growth:{title:"Growth Hub",headline:"Your growth resources",description:"Growth content available to your customer tenant.",cards:[]},
apps:{title:"My Applications",headline:"Your applications",description:"Application-specific information is shown only when an authorized application API is available.",cards:[]},
settings:{title:"Settings",headline:"Your workspace settings",description:"Workspace settings remain separate from administration controls.",cards:[]},
tickets:{title:"Tickets & Feedback",headline:"Support, without the clutter",description:"Ticket submission is enabled only when ticketing and application assignment are configured for your tenant.",cards:[]}
};
function safeText(value){return String(value??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
async function api(path,options={}){const response=await fetch(path,{...options,headers:{authorization:"Bearer "+bearerToken,"content-type":"application/json",...(options.headers||{})},cache:"no-store"});const payload=await response.json().catch(()=>({error:"invalid_response"}));if(!response.ok)throw new Error(payload.error?.message||payload.error||("HTTP "+response.status));return payload.data??payload;}
function renderItems(items){if(!Array.isArray(items)||!items.length){cards.innerHTML='<article class="card"><h3>No published content yet</h3><p>Your tenant has no content available in this section, or it has not been configured.</p></article>';return;}cards.innerHTML=items.map(item=>'<article class="card"><h3>'+safeText(item.title)+'</h3><p>'+safeText(item.body)+'</p></article>').join("");}
function renderCards(view){const v=content[view]||content.home;document.getElementById("pageTitle").textContent=v.title;document.getElementById("headline").textContent=v.headline;document.getElementById("description").textContent=v.description;nav.querySelectorAll("button").forEach(b=>{if(b.dataset.view===view)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});if(view==="help"||view==="growth"){const module=view==="help"?"help-center":"growth-hub";const route=view==="help"?"/customer/help-center/content":"/customer/growth-hub/content";if(!enabledModules.has(module)){cards.innerHTML='<article class="card"><h3>Module not enabled</h3><p>This section is not enabled for your tenant.</p></article>';return;}cards.innerHTML='<article class="card"><p>Loading tenant content…</p></article>';api(route).then(payload=>renderItems(payload.items)).catch(error=>{cards.innerHTML='<article class="card"><h3>Content unavailable</h3><p>'+safeText(error.message)+'</p></article>';});return;}if(view==="tickets"){cards.innerHTML='<article class="card"><h3>Ticket submission requires application assignment</h3><p>Connect the workspace first. Ticket creation is available only through the authenticated, tenant-scoped ticket API when durable ticketing and application assignments are configured. No sample ticket will be presented as real.</p></article>';return;}cards.innerHTML=v.cards.map(c=>'<article class="card"><div class="symbol">'+safeText(c[0])+'</div><h3>'+safeText(c[1])+'</h3><p>'+safeText(c[2])+'</p><button data-view="'+safeText(c[3])+'">Open section →</button></article>').join("");}
function applyModules(modules){enabledModules=new Set(Array.isArray(modules)?modules:[]);nav.querySelectorAll("button[data-view]").forEach(button=>{const map={help:"help-center",growth:"growth-hub",apps:"my-applications",tickets:"tickets-feedback",settings:"settings"};const key=map[button.dataset.view];button.hidden=!!key&&!enabledModules.has(key);});}
async function connect(){const input=document.getElementById("customerCredential");const token=input.value.trim();const message=document.getElementById("connectResult");if(!token){message.textContent="Enter the customer access credential provided by your administrator.";return;}bearerToken=token;message.textContent="Checking your customer access…";try{const session=await api("/customer/session");const context=await api("/customer/portal/context");const modules=await api("/customer/workspace/modules");applyModules(modules.modules);document.querySelector(".preview").textContent="CONNECTED · "+safeText(session.roleKey);document.getElementById("connectPanel").hidden=true;document.getElementById("description").textContent="Connected as "+session.actorId+". Workspace navigation and content are filtered by server-side tenant permissions.";message.textContent="";renderCards("home");}catch(error){bearerToken="";message.textContent="Could not connect: "+error.message;document.querySelector(".preview").textContent="NOT CONNECTED";}}
document.getElementById("connectButton").addEventListener("click",connect);
document.getElementById("customerCredential").addEventListener("keydown",e=>{if(e.key==="Enter")connect();});
document.getElementById("disconnectButton").addEventListener("click",()=>{bearerToken="";enabledModules.clear();document.getElementById("connectPanel").hidden=false;document.getElementById("customerCredential").value="";document.querySelector(".preview").textContent="NOT CONNECTED";nav.querySelectorAll("button").forEach(b=>b.hidden=false);renderCards("home");});
nav.addEventListener("click",e=>{const button=e.target.closest("button[data-view]");if(button&&!button.hidden){if(!bearerToken){apiStatus.textContent="Connect your customer workspace before opening modules.";return;}renderCards(button.dataset.view);}});
cards.addEventListener("click",e=>{const button=e.target.closest("button[data-view]");if(button&&bearerToken)renderCards(button.dataset.view);});
})();
</script></body></html>`;

export function isCustomerPortalPreviewRequest(request: { url?: string }): boolean {
  return new URL(request.url ?? "/", "http://localhost").pathname === "/customer-portal-preview";
}
