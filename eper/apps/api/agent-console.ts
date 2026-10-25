export function renderAgentConsole(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EPER Agent Workspace</title><style>
:root{color-scheme:light;--forest:#254d3a;--sage:#e7eee6;--ivory:#faf8f0;--gold:#b99a56;--ink:#243128;--muted:#647267;--line:#d9e0d6}
*{box-sizing:border-box}body{margin:0;background:var(--ivory);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
header{background:var(--forest);color:white;padding:22px clamp(16px,4vw,48px)}header h1{margin:0;font-size:23px}header p{margin:5px 0 0;color:#e0e9e0}
main{max-width:1200px;margin:0 auto;padding:24px 16px;display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:20px}
section,.panel{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;min-width:0}h2{font-size:17px;margin:0 0 12px}label{display:block;font-size:13px;font-weight:650;margin:12px 0 5px}input,select,textarea{width:100%;border:1px solid #cbd5c9;border-radius:8px;padding:10px;font:inherit;background:#fff;color:inherit}textarea{min-height:88px;resize:vertical}
button{border:0;border-radius:8px;background:var(--forest);color:#fff;padding:10px 13px;font:inherit;font-weight:650;cursor:pointer}button.secondary{background:var(--sage);color:var(--forest)}button.reject{background:#8a3f37}button:disabled{opacity:.5;cursor:not-allowed}.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.muted{color:var(--muted);font-size:13px}.notice{background:var(--sage);border-left:3px solid var(--gold);padding:10px;border-radius:6px;margin:12px 0}.draft{border:1px solid var(--line);border-radius:10px;padding:14px;margin:10px 0}.draft h3{font-size:15px;margin:0 0 6px}.status{display:inline-block;background:var(--sage);color:var(--forest);border-radius:99px;padding:3px 8px;font-size:12px;font-weight:700}.draft pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;background:#f7f8f4;padding:10px;border-radius:8px;max-height:320px;overflow:auto}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.toolbar input{max-width:230px}.hidden{display:none!important}
@media(max-width:760px){main{grid-template-columns:1fr}header{padding:18px 16px}}
</style></head><body>
<header><h1>EPER · Agent Workspace</h1><p>CRM · Sales · Marketing — draft, review, and approval in one place</p></header>
<main><section><h2>Secure session</h2>
<p class="muted">Use only in an authorized non-production environment. The token is held in page memory and is not saved to browser storage.</p>
<label for="token">Agent API bearer token</label><input id="token" type="password" autocomplete="off" placeholder="Paste configured token">
<label for="principal">Principal ID</label><input id="principal" placeholder="e.g. operator-1">
<div class="row"><button id="connect">Connect / refresh</button></div><div id="connection" class="notice" role="status">Not connected</div>
<hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
<h2>Create agent draft</h2><label for="agent">Agent</label><select id="agent"><option value="crm">CRM Agent</option><option value="sales">Sales Agent</option><option value="marketing">Marketing Agent</option></select>
<label for="intent">Workflow</label><select id="intent"></select>
<label for="objective">Objective / subject</label><input id="objective" placeholder="What should the agent prepare?">
<label for="audience">Audience</label><input id="audience" placeholder="Customer, segment, or stakeholder">
<label for="context">Source context (only include approved information)</label><textarea id="context" placeholder="Relevant notes or verified context"></textarea>
<label for="offer">Offer / approved URL (optional)</label><input id="offer" placeholder="Optional; not sent or published">
<div class="row"><button id="create">Generate draft</button></div><p class="muted">No external message, CRM write, or campaign publish is executed by this workspace.</p>
</section><section><div class="toolbar"><h2 style="margin-right:auto">Draft & approval queue</h2><select id="statusFilter" aria-label="Filter drafts" style="max-width:220px"><option value="">All statuses</option><option value="PENDING_APPROVAL">Pending approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><button id="refresh" class="secondary">Refresh queue</button></div>
<div class="notice">Maker-checker control: the person who created a draft cannot approve or reject it. Approval records intent only; it never triggers an external action.</div><div id="queue"><p class="muted">Connect to load drafts.</p></div></section></main>
<script>
(function(){
const intents={crm:[["lead-qualification","Lead qualification"],["contact-summary","Contact summary"],["next-action","Next action"]],sales:[["follow-up","Follow-up message"],["opportunity-plan","Opportunity plan"],["proposal-outline","Proposal outline"]],marketing:[["campaign-brief","Campaign brief"],["email-copy","Email copy"],["social-copy","Social copy"]]};
const $=id=>document.getElementById(id);let drafts=[];
function fillIntents(){const a=$("agent").value;$("intent").replaceChildren(...intents[a].map(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;return o;}));}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function setNotice(msg,ok){$("connection").textContent=msg;$("connection").style.borderLeftColor=ok?"#5b8c68":"#b85c4a";}
async function api(path,opts={}){const token=$("token").value.trim(),principal=$("principal").value.trim();if(!token||!principal)throw new Error("Enter the API token and principal ID first.");const response=await fetch(path,{...opts,headers:{"authorization":"Bearer "+token,"x-eper-principal-id":principal,...(opts.body?{"content-type":"application/json"}:{}),...(opts.headers||{})}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Request failed ("+response.status+")");return data;}
function render(){const filter=$("statusFilter").value;const items=drafts.filter(d=>!filter||d.status===filter);$("queue").replaceChildren();if(!items.length){const p=document.createElement("p");p.className="muted";p.textContent="No drafts match this filter."; $("queue").append(p);return;}
for(const d of items){const article=document.createElement("article");article.className="draft";const heading=document.createElement("h3");heading.textContent=d.agent.toUpperCase()+" · "+d.intent;const status=document.createElement("span");status.className="status";status.textContent=d.status;const meta=document.createElement("p");meta.className="muted";meta.textContent="Created by "+d.createdBy+" · "+new Date(d.createdAt).toLocaleString();const pre=document.createElement("pre");pre.textContent=JSON.stringify(d.content,null,2);article.append(heading,status,meta,pre);
if(d.status==="PENDING_APPROVAL"&&d.createdBy!==$("principal").value.trim()){const actions=document.createElement("div");actions.className="row";for(const [action,label,cls] of [["approve","Approve",""],["reject","Reject","reject"]]){const b=document.createElement("button");b.textContent=label;b.className=cls;b.onclick=async()=>{try{await api("/v1/agents/drafts/"+encodeURIComponent(d.id)+"/"+action,{method:"POST",body:JSON.stringify({note:action==="approve"?"Reviewed in Agent Workspace":"Rejected in Agent Workspace"})});await loadQueue();}catch(e){setNotice(e.message,false);}};actions.append(b);}article.append(actions);}
else if(d.status==="PENDING_APPROVAL"){const p=document.createElement("p");p.className="muted";p.textContent="Created by your principal; a different allowlisted reviewer must act.";article.append(p);}
$("queue").append(article);
}}
async function loadQueue(){try{const r=await api("/v1/agents/drafts");drafts=r.drafts;render();setNotice("Connected · "+drafts.length+" draft(s) loaded.",true);}catch(e){setNotice(e.message,false);}}
$("agent").addEventListener("change",fillIntents);$("connect").onclick=loadQueue;$("refresh").onclick=loadQueue;$("statusFilter").onchange=render;fillIntents();
$("create").onclick=async()=>{try{const agent=$("agent").value;const input={objective:$("objective").value.trim(),audience:$("audience").value.trim(),context:$("context").value.trim(),offer:$("offer").value.trim()};if(!input.objective&&!input.context)throw new Error("Enter an objective or source context.");const result=await api("/v1/agents/"+agent+"/drafts",{method:"POST",body:JSON.stringify({intent:$("intent").value,input})});drafts.unshift(result.draft);render();setNotice("Draft created and awaiting human review.",true);}catch(e){setNotice(e.message,false);}};
})();
</script></body></html>`;
}
