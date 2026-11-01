import type { IncomingMessage } from "node:http";

/** Operator console for tenant-scoped outbox inspection and audited replay. */
export const workflowOutboxAdminUiHtml = String.raw\`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER · Delivery Operations</title>
<style>
:root{color-scheme:light;--ink:#17233b;--muted:#64748b;--line:#dfe6ef;--bg:#f4f7fb;--blue:#315ff4;--red:#b42318;--amber:#9a6700}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Inter,system-ui,sans-serif}header{padding:22px clamp(16px,4vw,40px);background:#142544;color:white}h1{font-size:21px;margin:0}header p{margin:4px 0 0;color:#d4deef}.shell{max-width:1180px;margin:auto;padding:22px clamp(12px,3vw,30px) 60px}.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}.field{display:grid;gap:5px}.field label{font-size:12px;color:var(--muted);font-weight:700}input,textarea{width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:10px;font:inherit}button{border:0;border-radius:9px;padding:10px 14px;background:var(--blue);color:white;font:inherit;font-weight:700;cursor:pointer}button.secondary{background:#e9eef8;color:#243a60}button.danger{background:#fff0ef;color:var(--red)}button:disabled{opacity:.45;cursor:not-allowed}.status{min-height:20px;color:var(--muted);font-size:12px;margin-top:9px}.list{display:grid;gap:12px}.event{border:1px solid var(--line);border-radius:12px;padding:14px;background:#fff}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.pill{border-radius:999px;background:#fff1d6;color:var(--amber);font-size:11px;font-weight:800;padding:3px 8px}.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0;color:var(--muted);font-size:12px}.error{padding:10px;border-radius:8px;background:#fff5f4;color:var(--red);overflow-wrap:anywhere}.replay{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-top:12px}.empty{border:1px dashed #cbd5e1;border-radius:10px;padding:26px;text-align:center;color:var(--muted)}.hint{font-size:12px;color:var(--muted)}@media(max-width:700px){.grid,.meta,.replay{grid-template-columns:1fr}.grid button{width:100%}}
</style></head><body>
<header><h1>Delivery Operations</h1><p>Tenant-scoped dead-letter inspection · audited operator replay</p></header>
<main class="shell">
<section class="panel">
<div class="grid">
<div class="field"><label for="application">Application ID</label><input id="application" autocomplete="off" placeholder="app-123"></div>
<div class="field"><label for="token">Administrator bearer token</label><input id="token" type="password" autocomplete="off" placeholder="Session token"></div>
<button id="load">Load dead letters</button>
</div>
<div id="status" class="status" role="status" aria-live="polite">Connect with an administrator assigned to this application and holding workflow:admin.</div>
</section>
<section class="panel"><div class="top"><div><strong>Dead-letter queue</strong><div class="hint">Replay requeues the original event for the worker. It does not dispatch a provider call from this screen.</div></div><button class="secondary" id="refresh">Refresh</button></div>
<div id="events" class="list" style="margin-top:14px"><div class="empty">Load a queue to inspect failed deliveries.</div></div>
</section>
</main>
<script>
const byId=id=>document.getElementById(id);
const state={events:[]};
function apiBase(){return location.origin}
function headers(){return {authorization:"Bearer "+byId("token").value.trim(),"content-type":"application/json"}}
function status(message,isError=false){byId("status").textContent=message;byId("status").style.color=isError?"#b42318":""}
function safe(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function load(){const app=byId("application").value.trim();if(!app||!byId("token").value.trim()){status("Application ID and administrator token are required.",true);return}status("Loading…");try{const r=await fetch(apiBase()+"/admin/applications/"+encodeURIComponent(app)+"/workflow-outbox/dead-letters",{headers:headers()});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||j.error||"Unable to load dead letters");state.events=j.data.deadLetters||[];render();status(state.events.length+" dead-letter event(s) loaded.")}catch(e){status(e.message,true)}}
function render(){const root=byId("events");if(!state.events.length){root.innerHTML='<div class="empty">No dead-letter events in this application.</div>';return}root.innerHTML=state.events.map(({event,lastError,updatedAt})=>'<article class="event"><div class="top"><strong>'+safe(event.eventType)+' · '+safe(event.eventId)+'</strong><span class="pill">DEAD LETTER</span></div><div class="meta"><span>Attempts: '+safe(event.attempts)+'</span><span>Instance: '+safe(event.instanceId)+'</span><span>Updated: '+safe(updatedAt)+'</span></div><div class="error">'+safe(lastError||"No error detail recorded")+'</div><div class="replay"><div class="field"><label for="reason-'+safe(event.eventId)+'">Operator reason</label><textarea id="reason-'+safe(event.eventId)+'" rows="2" maxlength="2000" placeholder="Explain why this event is safe to retry"></textarea></div><button data-replay="'+safe(event.eventId)+'">Audited replay</button></div></article>').join("");root.querySelectorAll("[data-replay]").forEach(button=>button.addEventListener("click",()=>replay(button.dataset.replay)))}
async function replay(eventId){const app=byId("application").value.trim();const reason=byId("reason-"+eventId).value.trim();if(!reason){status("An operator reason is required.",true);return}const idempotencyKey="operator-"+crypto.randomUUID();status("Submitting audited replay…");try{const r=await fetch(apiBase()+"/admin/applications/"+encodeURIComponent(app)+"/workflow-outbox/dead-letters/"+encodeURIComponent(eventId)+"/replay",{method:"POST",headers:headers(),body:JSON.stringify({reason,idempotencyKey})});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||j.error||"Replay was not accepted");status(j.data.replay.alreadyApplied?"This replay request was already applied.":"Replay accepted and queued for the worker.");await load()}catch(e){status(e.message,true)}}
byId("load").addEventListener("click",load);byId("refresh").addEventListener("click",load);
</script></body></html>\`;

export function isWorkflowOutboxAdminUiRequest(request: IncomingMessage): boolean {
  return request.method === "GET" && new URL(request.url ?? "/", "http://localhost").pathname === "/admin/workflow-outbox-ui";
}
