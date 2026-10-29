export function renderCampaignSchedulerConsole(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campaign schedules | EPER</title>
<style>
:root{color-scheme:light;--ink:#182230;--muted:#667085;--line:#d9e0e8;--surface:#fff;--page:#f4f7fb;--accent:#2457c5;--danger:#b42318}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:auto;padding:clamp(16px,4vw,36px)}h1{font-size:clamp(24px,4vw,34px);margin:0 0 6px}h2{font-size:19px;margin:0 0 16px}.muted{color:var(--muted)}.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;margin:18px 0;box-shadow:0 3px 12px #15243b08}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-weight:600;font-size:13px}input,select,textarea{width:100%;font:inherit;padding:10px 11px;border:1px solid #b9c4d2;border-radius:8px;background:white;color:var(--ink)}textarea{min-height:78px;resize:vertical}button{font:inherit;font-weight:650;border:0;border-radius:8px;padding:10px 14px;background:var(--accent);color:white;cursor:pointer}button.secondary{background:#e8eef9;color:#203b70}button.danger{background:#fff0ef;color:var(--danger)}button:disabled{opacity:.55;cursor:wait}.actions{display:flex;flex-wrap:wrap;gap:8px}.notice{padding:11px 13px;border-radius:8px;background:#edf3ff;color:#203b70;white-space:pre-wrap}.notice.error{background:#fff0ef;color:var(--danger)}.schedule{border:1px solid var(--line);border-radius:10px;padding:14px;margin:10px 0}.schedule-head{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}.pill{display:inline-block;border-radius:99px;background:#edf1f6;padding:3px 9px;font-size:12px;font-weight:700}.schedule p{margin:7px 0}.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end}@media(max-width:640px){.grid{grid-template-columns:1fr}.field.full{grid-column:auto}.panel{padding:15px}.toolbar>*{width:100%}}
</style>
</head>
<body><main>
<header><p class="muted">EPER · Application operations</p><h1>Campaign schedules</h1><p class="muted">Create drafts, review schedule state, and manage approval and lifecycle actions. API authorization remains authoritative.</p></header>
<section class="panel" aria-labelledby="connection-heading"><h2 id="connection-heading">Application connection</h2><div class="grid">
<div class="field"><label for="applicationId">Application ID</label><input id="applicationId" autocomplete="off" placeholder="e.g. app-a" maxlength="128"></div>
<div class="field"><label for="token">Session bearer token</label><input id="token" type="password" autocomplete="off" placeholder="Paste your authorized session token"></div>
</div><p class="muted">The token is kept only in this page's memory and is not persisted to browser storage.</p><div class="actions"><button id="loadButton">Load schedules</button></div></section>
<section class="panel" aria-labelledby="create-heading"><h2 id="create-heading">Create schedule draft</h2><form id="createForm" class="grid">
<div class="field"><label for="campaignId">Campaign ID</label><input id="campaignId" required maxlength="128"></div>
<div class="field"><label for="triggerType">Trigger type</label><select id="triggerType"><option value="once">Once</option><option value="recurring">Recurring</option><option value="event">Event</option><option value="condition">Condition</option></select></div>
<div class="field"><label for="timezone">Time zone</label><input id="timezone" required maxlength="128" value="Asia/Kolkata"></div>
<div class="field full"><label for="scheduleDefinition">Schedule definition (JSON)</label><textarea id="scheduleDefinition" required>{"at":"2030-01-01T10:00:00+05:30"}</textarea></div>
<div class="field full"><div class="actions"><button type="submit">Create draft</button></div></div>
</form></section>
<div id="notice" class="notice" role="status" aria-live="polite">Enter an application ID and authorized token to load schedules.</div>
<section class="panel"><div class="schedule-head"><h2>Schedules</h2><button id="refreshButton" class="secondary" type="button">Refresh</button></div><div id="schedules"><p class="muted">No schedules loaded yet.</p></div></section>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { busy: false, schedules: [] };
  const notice = (message, error = false) => { $('notice').textContent = message; $('notice').className = error ? 'notice error' : 'notice'; };
  const appId = () => $('applicationId').value.trim();
  const token = () => $('token').value.trim();
  const endpoint = () => '/customer/applications/' + encodeURIComponent(appId()) + '/campaign-schedules';
  async function api(path, options = {}) {
    if (!appId() || !token()) throw new Error('Application ID and authorized token are required.');
    const response = await fetch(path, { ...options, headers: { accept: 'application/vnd.eper.v1+json', ...(options.body ? {'content-type':'application/json'} : {}), authorization: 'Bearer ' + token(), ...(options.headers || {}) } });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || body?.error || ('Request failed (' + response.status + ')'));
    return body.data ?? body;
  }
  function button(label, action, id, danger = false) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = danger ? 'danger' : 'secondary';
    b.addEventListener('click', () => runAction(action, id)); return b;
  }
  function render() {
    const root = $('schedules'); root.replaceChildren();
    if (!state.schedules.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No schedules found for this application.'; root.append(p); return; }
    for (const s of state.schedules) {
      const card = document.createElement('article'); card.className = 'schedule';
      const head = document.createElement('div'); head.className = 'schedule-head';
      const title = document.createElement('strong'); title.textContent = s.campaignId || s.id;
      const status = document.createElement('span'); status.className = 'pill'; status.textContent = (s.status || 'unknown') + ' · ' + (s.approvalStatus || 'approval unknown');
      head.append(title, status); card.append(head);
      const detail = document.createElement('p'); detail.className = 'muted'; detail.textContent = 'ID: ' + s.id + ' · Trigger: ' + (s.triggerType || '—') + ' · Time zone: ' + (s.timezone || '—');
      card.append(detail);
      const actions = document.createElement('div'); actions.className = 'actions';
      if (s.approvalStatus !== 'approved' && s.status !== 'cancelled') actions.append(button('Approve', 'approve', s.id));
      if (s.status === 'scheduled') actions.append(button('Pause', 'pause', s.id));
      if (s.status === 'paused') actions.append(button('Resume', 'resume', s.id));
      if (s.status !== 'cancelled' && s.status !== 'completed') actions.append(button('Cancel', 'cancel', s.id, true));
      card.append(actions); root.append(card);
    }
  }
  async function load() {
    try { notice('Loading schedules…'); const result = await api(endpoint() + '?limit=50&offset=0'); state.schedules = Array.isArray(result.schedules) ? result.schedules : []; render(); notice('Loaded ' + state.schedules.length + ' schedule(s).'); }
    catch (e) { notice(e.message || 'Unable to load schedules.', true); }
  }
  async function runAction(action, id) {
    try {
      let body;
      if (action === 'approve' || action === 'resume') {
        const suggested = new Date(Date.now() + 5 * 60 * 1000); suggested.setSeconds(0,0);
        const next = prompt('Enter the next run time in ISO format (must be in the future):', suggested.toISOString());
        if (!next) return;
        body = { nextRunAt: next };
      }
      notice('Applying ' + action + '…');
      await api(endpoint() + '/' + encodeURIComponent(id) + '/' + action, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
      notice('Schedule updated. Refreshing authoritative state…'); await load();
    } catch (e) { notice(e.message || 'Schedule action failed.', true); }
  }
  $('loadButton').addEventListener('click', load);
  $('refreshButton').addEventListener('click', load);
  $('createForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      let scheduleDefinition;
      try { scheduleDefinition = JSON.parse($('scheduleDefinition').value); } catch { throw new Error('Schedule definition must be valid JSON.'); }
      if (!scheduleDefinition || typeof scheduleDefinition !== 'object' || Array.isArray(scheduleDefinition)) throw new Error('Schedule definition must be a JSON object.');
      notice('Creating schedule draft…');
      await api(endpoint(), { method: 'POST', body: JSON.stringify({ campaignId: $('campaignId').value.trim(), triggerType: $('triggerType').value, timezone: $('timezone').value.trim(), scheduleDefinition }) });
      notice('Draft created. Refreshing authoritative state…'); await load();
    } catch (e) { notice(e.message || 'Could not create schedule.', true); }
  });
})();
</script></body></html>`;
}
