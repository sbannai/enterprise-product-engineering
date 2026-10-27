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
.support-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.support-actions button{min-height:42px}
.support-side{display:grid;gap:12px}.support-side-card{background:#fbfcff;border:1px solid #e0e6ef;border-radius:12px;padding:15px}
.support-side-card strong{font-size:13px}.support-side-card p,.support-side-card li{font-size:12px;color:#647188;line-height:1.55}.support-side-card p{margin:7px 0 0}.support-side-card ul{padding-left:18px;margin:9px 0 0}
.support-pill{display:inline-flex;border-radius:999px;padding:5px 9px;background:#edf2ff;color:#3150aa;font-size:11px;font-weight:750}
.support-ticket{border:1px solid #e0e6ef;border-radius:11px;padding:13px;margin-top:10px}
@media(max-width:700px){.support-layout{grid-template-columns:1fr}.support-grid{grid-template-columns:1fr}.support-field.span-2{grid-column:auto}.support-panel{padding:15px}}
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
<button data-view="tickets"><span class="nav-icon">✉</span>Tickets &amp; Feedback</button>
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
settings:{title:"Application Settings",headline:"Configure each application independently",description:"Select an application, then manage its own integrations and alert policies. Video conferencing and alerts belong in the customer admin workspace—not the platform admin panel.",cards:[["▦","Select an application","Choose an application assigned to your customer before editing its settings. Each application has an isolated configuration scope.","apps"],["▣","Video conferencing","Configure this application’s meeting provider, connection reference, meeting defaults, and connection health independently.","video"],["♧","Alerts & notifications","Configure this application’s alert events, channels, recipients, quiet hours, and delivery history independently.","alerts"],["⚙","Application preferences","Manage locale, currency display, workflow preferences, and other settings for this application.","settings"]]},
video:{title:"Video Conferencing",headline:"Video conferencing · selected application",description:"Design preview only. Provider credentials and connection tests must be handled by authorized application-scoped APIs.",cards:[["▣","Meeting provider","Choose Google Meet, Zoom, or another approved provider for this application only.","video"],["⚿","Connection & defaults","Store only a server-side credential reference; configure meeting defaults and inspect sanitized connection health.","video"],["↩","Back to settings","Return to the application settings overview.","settings"]]},
alerts:{title:"Alerts & Notifications",headline:"Alerts for the selected application",description:"Each application owns its alert rules, templates, audiences, channels, and delivery history—even when a provider project is shared.",cards:[["♧","Alert rules","Select event subscriptions, severity, templates, locale, timezone, and quiet hours for this application.","alerts"],["◎","Recipients & channels","Manage application-member audiences and approved in-app, push, email, or WhatsApp channels with consent controls.","alerts"],["▤","Delivery history","Review retries, failures, idempotency outcomes, and audit references for this application only.","alerts"],["↩","Back to settings","Return to the application settings overview.","settings"]]},
tickets:{title:"Tickets & Feedback",headline:"Support, without the clutter",description:"Report and follow up on tickets for the selected application only. Your application choices come from your authorized assignments.",cards:[]}
};
function show(view){const v=content[view]||content.home;document.getElementById("pageTitle").textContent=v.title;document.getElementById("headline").textContent=v.headline;document.getElementById("description").textContent=v.description;document.querySelectorAll("nav button").forEach(b=>{if(b.dataset.view===view)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});if(view==="tickets"){
document.getElementById("cards").innerHTML='<div class="support-layout"><section class="support-panel"><h3>Submit a report</h3><p class="subcopy">One issue per ticket helps us triage it faster. Fields marked * are required.</p><form id="supportForm"><div class="support-grid"><div class="support-field"><label for="supportType">What would you like to share? *</label><select id="supportType" required><option>Defect / issue</option><option>Feedback</option><option>Feature request</option><option>Question</option></select></div><div class="support-field"><label for="supportApp">Affected application *</label><select id="supportApp" required><option>Only applications assigned to your tenant (loaded by authorized API)</option></select><p class="support-hint">The server validates tenant and application assignment; this preview list is not live data.</p></div><div class="support-field span-2"><label for="supportTitle">Short title *</label><input id="supportTitle" required maxlength="120" placeholder="e.g. Receipt download fails"><p class="support-hint">Summarize the issue in one sentence.</p></div><div class="support-field span-2"><label for="supportDetails">What happened? *</label><textarea id="supportDetails" required placeholder="Steps to reproduce, actual result and expected result"></textarea><p class="support-hint">Never include passwords, private keys or payment-card data.</p></div><div class="support-field span-2"><label for="supportImpact">Business impact *</label><textarea id="supportImpact" required placeholder="Who is affected? Is work blocked? Is there a workaround?"></textarea></div><div class="support-field span-2"><label for="supportEvidence">Evidence reference (optional)</label><input id="supportEvidence" placeholder="Screenshot, log or evidence reference"></div></div><div class="support-actions"><button type="submit">Submit report</button><span class="support-hint">Preview only · no live ticket service</span></div><p id="supportResult" class="support-hint" role="status" aria-live="polite" style="margin-top:12px"></p></form></section><aside class="support-side"><div class="support-side-card"><strong>What happens next?</strong><ul><li>Support reviews the report.</li><li>Severity and ownership are triaged.</li><li>Progress is shown in My tickets.</li></ul></div><div class="support-side-card"><strong>Help us resolve it faster</strong><p>Include the affected app, reproduction steps, expected result and business impact. Keep sensitive data out of reports.</p></div><div class="support-side-card"><strong>My tickets</strong><div class="support-ticket"><span class="support-pill">Sample · Triaged</span><p><strong>Receipt download not available</strong></p><p>Owner: Support team · Evidence pending</p></div></div><div class="support-side-card"><strong>P1 severity is confirmed by triage</strong><p>A submitted report is not automatically a P1. Confirmed P1 counting requires distinct evidence-backed defects.</p></div></aside></div>';
document.getElementById("supportForm").addEventListener("submit",function(e){e.preventDefault();document.getElementById("supportResult").textContent="Preview only — ticket API is not connected, so no ticket was created.";});
}else{document.getElementById("cards").innerHTML=v.cards.map(c=>'<article class="card"><div class="symbol">'+c[0]+'</div><h3>'+c[1]+'</h3><p>'+c[2]+'</p><button data-view="'+c[3]+'">View section →</button></article>').join("");}
document.querySelectorAll("nav button").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
document.querySelectorAll("[data-view]").forEach(b=>{if(!b.closest("#cards"))b.addEventListener("click",()=>show(b.dataset.view))});
})();
</script></body></html>`;

export function isCustomerPortalPreviewRequest(request: { url?: string }): boolean {
  return new URL(request.url ?? "/", "http://localhost").pathname === "/customer-portal-preview";
}
