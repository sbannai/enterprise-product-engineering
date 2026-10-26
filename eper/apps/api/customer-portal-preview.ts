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
nav{display:grid;gap:6px}nav button{border:0;background:transparent;color:#cbd5e5;padding:12px;border-radius:9px;text-align:left;font:inherit;cursor:pointer}nav button[aria-current=page],nav button:hover{background:#263653;color:white}.nav-icon{display:inline-block;width:28px;color:#9eb7ff}
main{padding:30px;min-width:0}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid #dfe6f0;padding-bottom:20px}.eyebrow{font-size:12px;color:#69768b}.top h1{margin:5px 0 0;font-size:26px}.preview{background:#fff3d7;color:#815200;border:1px solid #f0d69b;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700}
.intro{padding:28px 0 18px}.intro h2{font-size:25px;margin:0 0 8px}.intro p{color:#647188;margin:0;max-width:720px;line-height:1.6}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{background:white;border:1px solid #e0e6ef;border-radius:16px;padding:22px;box-shadow:0 5px 20px #16294b08}.card .symbol{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:#edf2ff;color:#315efb;font-size:22px}.card h3{margin:16px 0 7px}.card p{color:#647188;line-height:1.5;margin:0 0 16px}.card button{border:0;background:#315efb;color:white;border-radius:9px;padding:10px 13px;font:inherit;font-weight:700;cursor:pointer}.subnav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 20px}.subnav span{background:#e9eef8;border-radius:999px;padding:7px 10px;font-size:12px;color:#33425b}
.note{margin-top:20px;background:#fff;border:1px solid #e0e6ef;border-radius:12px;padding:14px;color:#647188;font-size:13px;line-height:1.55}
@media(max-width:700px){.layout{grid-template-columns:1fr}aside{padding:12px}.brand{padding:6px 8px 12px}nav{display:flex;overflow:auto}nav button{white-space:nowrap;padding:10px}main{padding:18px}.cards{grid-template-columns:1fr}.top h1{font-size:21px}}
</style>
</head>
<body><div class="layout">
<aside><div class="brand">EPER <span>Customer</span></div><div class="caption">Customer workspace</div>
<nav aria-label="Customer navigation">
<button aria-current="page" data-view="home"><span class="nav-icon">⌂</span>Home</button>
<button data-view="help"><span class="nav-icon">?</span>Help Center</button>
<button data-view="growth"><span class="nav-icon">↗</span>Growth Hub</button>
<button data-view="apps"><span class="nav-icon">▦</span>My Applications</button>
<button data-view="settings"><span class="nav-icon">⚙</span>Settings</button>
</nav></aside>
<main><div class="top"><div><div class="eyebrow">EPER / Customer workspace</div><h1 id="pageTitle">Your workspace</h1></div><span class="preview">DESIGN PREVIEW — NOT SIGNED IN</span></div>
<section class="intro"><h2 id="headline">Welcome to your customer workspace</h2><p id="description">Your application tools, help resources, and growth resources belong in the customer experience—not in the administration workspace.</p></section>
<div class="cards" id="cards">
<article class="card"><div class="symbol">?</div><h3>Help Center</h3><p>Browse product guides, setup instructions, FAQs, and support pathways for your applications.</p><button data-view="help">Open Help Center →</button></article>
<article class="card"><div class="symbol">↗</div><h3>Growth Hub</h3><p>Access campaign resources, content planning, lead insights, and growth playbooks configured for your workspace.</p><button data-view="growth">Open Growth Hub →</button></article>
</div>
<div class="note" role="note">This is a navigation and layout prototype only. Authentication, tenant-scoped data, support actions, and growth integrations are not connected yet. Do not use this preview as proof of a working customer login.</div>
</main></div>
<script>
(function(){
const content={
home:{title:"Your workspace",headline:"Welcome to your customer workspace",description:"Your application tools, help resources, and growth resources belong in the customer experience—not in the administration workspace.",cards:[["?","Help Center","Browse product guides, setup instructions, FAQs, and support pathways for your applications.","help"],["↗","Growth Hub","Access campaign resources, content planning, lead insights, and growth playbooks configured for your workspace.","growth"]]},
help:{title:"Help Center",headline:"Find answers and get support",description:"A dedicated customer space for application guides, onboarding steps, frequently asked questions, and support requests.",cards:[["▤","Product guides","Step-by-step guidance for configuring and using your applications.","help"],["✉","Support pathways","A place for support requests and status visibility; integration is not connected in this preview.","help"]]},
growth:{title:"Growth Hub",headline:"Turn your workspace into a growth engine",description:"A customer-facing home for campaign planning, content resources, lead insights, and growth playbooks.",cards:[["✎","Content planning","Plan and organize content initiatives for your own applications.","growth"],["◎","Growth insights","A future view for campaign and lead performance, subject to connected data and permissions.","growth"]]},
apps:{title:"My Applications",headline:"Your applications",description:"Application-specific tools and settings will be scoped to the authenticated tenant and selected application.",cards:[["▦","Application workspace","Application data and actions require tenant authorization before being connected.","apps"]]},
settings:{title:"Settings",headline:"Your workspace settings",description:"Settings should be scoped by customer and application, with credential references kept separate from ordinary configuration.",cards:[["⚙","Application preferences","Locale, currency, and application preferences will be wired through authorized APIs.","settings"]]}
};
function show(view){const v=content[view]||content.home;document.getElementById("pageTitle").textContent=v.title;document.getElementById("headline").textContent=v.headline;document.getElementById("description").textContent=v.description;document.querySelectorAll("nav button").forEach(b=>{if(b.dataset.view===view)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});document.getElementById("cards").innerHTML=v.cards.map(c=>'<article class="card"><div class="symbol">'+c[0]+'</div><h3>'+c[1]+'</h3><p>'+c[2]+'</p><button data-view="'+c[3]+'">View section →</button></article>').join("");document.getElementById("cards").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)))}
document.querySelectorAll("nav button").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
document.querySelectorAll("[data-view]").forEach(b=>{if(!b.closest("#cards"))b.addEventListener("click",()=>show(b.dataset.view))});
})();
</script></body></html>`;

export function isCustomerPortalPreviewRequest(request: { url?: string }): boolean {
  return new URL(request.url ?? "/", "http://localhost").pathname === "/customer-portal-preview";
}
