// DRP Push console: a OneSignal-style view of the push service.
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const { esc, fill, LINKS, TRIGGERS } = DRP;
let devices = [], segments = [], messages = [], overview = null;
let openMsg = null;
let draft = { segment: 'all', device: '' };

function flash(t, ms = 3500) { const el = $('#toastmsg'); el.textContent = t; el.style.display = 'block'; clearTimeout(flash.t); flash.t = setTimeout(() => (el.style.display = 'none'), ms); }
const time = (iso) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
const view = () => (location.hash || '#overview').slice(1);

function profileTags(p = {}) {
  return [p.grade, `${p.totalBooks | 0} books`, `${p.daysInactive | 0}d inactive`, `${p.streak | 0}w streak`, p.activityPending ? 'activity pending' : null].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
}

// ── Views ──
const V = {
  overview() {
    const o = overview || { subscribers: 0, messages: 0, sent: 0, shown: 0, clicked: 0 };
    return `
      <div class="head"><div><h1>Overview</h1><p>Live numbers from the push service.</p></div><a class="btn primary" href="#new">New message</a></div>
      <div class="kpis">
        <div class="kpi"><small>Subscribed phones</small><b>${o.subscribers}</b><span>reachable right now</span></div>
        <div class="kpi"><small>Messages</small><b>${o.messages}</b><span>${o.sent} pushes accepted</span></div>
        <div class="kpi"><small>Shown on phone</small><b>${pct(o.shown, o.sent)}</b><span>${o.shown} of ${o.sent} displayed</span></div>
        <div class="kpi"><small>Opened</small><b>${pct(o.clicked, o.shown)}</b><span>${o.clicked} taps</span></div>
      </div>
      <div class="card"><h2>Recent messages</h2>${msgTable(messages.slice(0, 6), false)}</div>`;
  },

  audience() {
    return `
      <div class="head"><div><h1>Audience</h1><p>Every phone that turned on reminders on the teacher site. Tags drive the segments.</p></div></div>
      <div class="card"><div class="tbl-wrap">${devices.length ? `<table>
        <thead><tr><th>Teacher</th><th>Device</th><th>Tags</th><th>Subscribed</th><th>Last seen</th><th></th></tr></thead>
        <tbody>${devices.map((d) => `<tr>
          <td><b>${esc(d.profile?.teacher || 'Unnamed')}</b><div class="sub">${esc(d.profile?.school || '')}</div></td>
          <td>${esc(d.ua?.label || 'Phone')}<div class="sub">${esc(d.endpointHost || '')}</div></td>
          <td>${profileTags(d.profile)}</td>
          <td class="sub">${time(d.createdAt)}</td>
          <td class="sub">${esc(DRP.ago(d.lastSeen))}</td>
          <td><div class="acts"><button class="btn" data-edit="${d.id}">Edit tags</button><button class="btn" data-test="${d.id}">Send test</button><button class="btn danger" data-del="${d.id}" aria-label="Remove ${esc(d.profile?.teacher || 'phone')}">Remove</button></div></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">No phones yet. Open the teacher site on a phone and turn on reminders.</div>'}</div></div>`;
  },

  segments() {
    return `
      <div class="head"><div><h1>Segments</h1><p>Saved filters on phone tags. Counts update as teachers read.</p></div></div>
      <div class="segs">${segments.map((s) => `<div class="seg"><b>${esc(s.name)}</b><code>${esc(s.rule)}</code><span class="n">${s.count}</span><span class="sub">${s.count === 1 ? 'phone' : 'phones'}</span><button class="btn" data-seg="${s.id}" ${s.count ? '' : 'disabled'}>Message this segment</button></div>`).join('')}</div>`;
  },

  messages() {
    return `
      <div class="head"><div><h1>Messages</h1><p>Every push sent through the service. Select a row for per-phone delivery.</p></div><a class="btn primary" href="#new">New message</a></div>
      <div class="card">${msgTable(messages, true)}</div>`;
  },

  new() {
    const segOpts = segments.map((s) => `<option value="seg:${s.id}" ${draft.device ? '' : s.id === draft.segment ? 'selected' : ''}>${esc(s.name)} · ${s.count}</option>`).join('');
    const devOpts = devices.map((d) => `<option value="dev:${d.id}" ${draft.device === d.id ? 'selected' : ''}>${esc(d.profile?.teacher || 'Unnamed')} · ${esc(d.ua?.label || 'Phone')}</option>`).join('');
    return `
      <div class="head"><div><h1>New push message</h1><p>Compose, target a segment or one phone, and send.</p></div></div>
      <div class="form">
        <form class="card" id="nm">
          <label class="f">Start from a template<select id="tpl"><option value="">Blank message</option>${TRIGGERS.map((t) => `<option value="${t.id}">${t.id} · ${esc(t.name)}</option>`).join('')}</select></label>
          <label class="f">Audience<select id="aud"><optgroup label="Segments">${segOpts}</optgroup>${devOpts ? `<optgroup label="One phone">${devOpts}</optgroup>` : ''}</select></label>
          <label class="f">Title<input id="t" required maxlength="120" value="${esc(draft.title || '')}"></label>
          <label class="f">Message<textarea id="b" rows="3" maxlength="400">${esc(draft.body || '')}</textarea><small>Personalise with {teacher} {class} {theme} {book} {left} {days} {streak}</small></label>
          <label class="f">Button label<input id="c" maxlength="40" value="${esc(draft.cta || '')}"></label>
          <label class="f">Launch URL<select id="u">${Object.entries(LINKS).map(([k, v]) => `<option value="${v.url}">${esc(v.label)} — ${v.url}</option>`).join('')}</select></label>
          <button class="btn primary" type="submit" id="sendBtn">Send message</button>
        </form>
        <div><div class="card"><h2>Preview</h2><div class="pv"><div class="n"><div class="nh"><img src="/icons/icon-192.png" alt=""><span>DRP Reading · now</span></div><div class="nt" id="pt"></div><div class="nb" id="pb"></div><div class="na" id="pc"></div></div></div><p class="sub" id="pas" style="margin:10px 0 0"></p></div></div>
      </div>`;
  },

  api() {
    const base = location.origin;
    return `
      <div class="head"><div><h1>API</h1><p>The same endpoints the Nudge Studio uses. In production, the rules engine calls <code>/api/send</code> on a schedule.</p></div></div>
      <div class="card"><h2>Authentication</h2><p class="sub" style="margin:0 0 10px">Admin calls carry the demo passcode in a header. Phones only use the public endpoints.</p><pre><code>x-admin-key: &lt;your passcode&gt;</code></pre></div>
      <div class="card"><h2>Send a message to a segment</h2><pre><code>curl -X POST ${esc(base)}/api/send \\
  -H "content-type: application/json" \\
  -H "x-admin-key: $DRP_PASSCODE" \\
  -d '{
    "title": "{class} is {left} from a badge",
    "body": "Hi {teacher}, pick up exactly where you left off.",
    "cta": "Resume reading",
    "url": "/?open=resume",
    "trigger": "L2",
    "audience": { "type": "segment", "segment": "inactive_7" },
    "source": "api"
  }'</code></pre></div>
      <div class="card"><h2>Endpoints</h2><div class="ep">
        <b>GET</b><span><code>/api/config</code> — public key phones subscribe with (public)</span>
        <b>POST</b><span><code>/api/subscribe</code> — register a phone and its tags (public)</span>
        <b>POST</b><span><code>/api/profile</code> — update a phone's tags (public, by phone ID)</span>
        <b>POST</b><span><code>/api/track</code> — phone reports shown or opened (public)</span>
        <b>GET</b><span><code>/api/devices</code> — list phones (admin)</span>
        <b>PATCH</b><span><code>/api/devices/:id</code> — edit tags (admin)</span>
        <b>GET</b><span><code>/api/segments</code> — segments with counts (admin)</span>
        <b>POST</b><span><code>/api/send</code> — send to a segment or phones (admin)</span>
        <b>GET</b><span><code>/api/messages</code> — delivery report (admin)</span>
      </div></div>`;
  },
};

function msgTable(list, expandable) {
  if (!list.length) return '<div class="empty">No messages yet.</div>';
  return `<div class="tbl-wrap"><table><thead><tr><th>Sent</th><th>Message</th><th>Audience</th><th>Source</th><th>Delivery</th></tr></thead><tbody>${list.map((m) => {
    const s = m.stats;
    const row = `<tr class="${expandable ? 'click' : ''}" data-msg="${m.id}" ${expandable ? 'tabindex="0" aria-expanded="' + (openMsg === m.id) + '"' : ''}>
      <td class="sub">${time(m.createdAt)}</td>
      <td><b>${esc(m.title)}</b><div class="sub">${esc(m.trigger || '')}${m.trigger ? ' · ' : ''}${esc(m.body).slice(0, 80)}</div></td>
      <td>${esc(m.audience.label)}<div class="sub">${m.audience.count} ${m.audience.count === 1 ? 'phone' : 'phones'}</div></td>
      <td><span class="badge mute">${esc(m.source)}</span></td>
      <td><span class="badge ${s.targeted && s.sent === s.targeted ? 'good' : s.sent ? 'warn' : 'bad'}">Sent ${s.sent}/${s.targeted}</span> <span class="badge ${s.shown ? 'info' : 'mute'}">Shown ${s.shown}</span> <span class="badge ${s.clicked ? 'good' : 'mute'}">Opened ${s.clicked}</span></td></tr>`;
    if (!expandable || openMsg !== m.id) return row;
    return row + `<tr class="detail"><td colspan="5"><table style="min-width:0"><thead><tr><th>Teacher</th><th>Device</th><th>Push network</th><th>Shown</th><th>Opened</th></tr></thead><tbody>${m.results.map((r) => `<tr>
      <td>${esc(r.teacher || '—')}</td><td class="sub">${esc(r.device || '')}</td>
      <td>${r.ok ? `<span class="badge good">Accepted · ${r.status}</span>` : `<span class="badge bad">Failed · ${r.status || 'error'}</span><div class="sub">${esc(r.error || '')}</div>`}</td>
      <td>${r.shown ? '<span class="badge info">Yes</span>' : '<span class="badge mute">Not yet</span>'}</td>
      <td>${r.clicked ? '<span class="badge good">Yes</span>' : '<span class="badge mute">No</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="sub">No phones matched.</td></tr>'}</tbody></table></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

// ── Render + bind ──
function render() {
  const v = V[view()] ? view() : 'overview';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + v));
  if (v === 'new' && $('#nm')) return; // don't clobber a form being typed in
  $('#main').innerHTML = V[v]();
  bind(v);
}
function bind(v) {
  if (v === 'new') {
    const pv = () => {
      const a = $('#aud').value || 'seg:all';
      const t = a.startsWith('dev:') ? devices.find((d) => d.id === a.slice(4)) : devices.find((d) => (DRP.SEGMENT_TESTS[a.slice(4)] || (() => true))(d.profile || {}));
      const p = t ? t.profile : DRP.SAMPLE_PROFILE;
      $('#pt').textContent = fill($('#t').value, p) || 'Title';
      $('#pb').textContent = fill($('#b').value, p);
      $('#pc').textContent = fill($('#c').value, p);
      $('#pas').textContent = t ? `As ${p.teacher || 'this teacher'} will see it.` : 'Sample teacher shown. No phone in this audience yet.';
    };
    $('#tpl').onchange = () => {
      const t = TRIGGERS.find((x) => x.id === $('#tpl').value);
      if (!t) return;
      $('#t').value = t.title; $('#b').value = t.body; $('#c').value = t.cta; $('#u').value = LINKS[t.link].url;
      if (!$('#aud').value.startsWith('dev:')) $('#aud').value = 'seg:' + t.segment;
      pv();
    };
    ['#t', '#b', '#c', '#aud'].forEach((s) => $(s).addEventListener('input', pv));
    $('#aud').addEventListener('change', pv);
    pv();
    $('#nm').onsubmit = async (e) => {
      e.preventDefault();
      const a = $('#aud').value || 'seg:all';
      const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const r = await DRP.api('/api/send', { body: {
          title: $('#t').value, body: $('#b').value, cta: $('#c').value, url: $('#u').value, trigger: $('#tpl').value || '', source: 'console',
          audience: a.startsWith('dev:') ? { type: 'devices', deviceIds: [a.slice(4)] } : { type: 'segment', segment: a.slice(4) },
        } });
        const s = r.message.stats;
        flash(s.targeted ? `Sent to ${s.sent} of ${s.targeted} ${s.targeted === 1 ? 'phone' : 'phones'}` : 'No phones matched this audience');
        draft = { segment: 'all', device: '' }; openMsg = r.message.id;
        location.hash = '#messages';
        await refresh();
      } catch (err) { flash('Send failed: ' + err.message, 6000); btn.disabled = false; btn.textContent = 'Send message'; }
    };
  }
}

$('#main').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-msg],[data-edit],[data-test],[data-del],[data-seg]');
  if (!t) return;
  if (t.dataset.msg && view() === 'messages') { openMsg = openMsg === t.dataset.msg ? null : t.dataset.msg; render(); }
  if (t.dataset.seg) { draft = { segment: t.dataset.seg, device: '' }; location.hash = '#new'; }
  if (t.dataset.test) {
    const d = devices.find((x) => x.id === t.dataset.test); t.disabled = true;
    try { const r = await DRP.api('/api/send', { body: { title: 'Test from the push console', body: 'Hi {teacher}, this phone is set up for reading reminders.', cta: 'Open', url: '/?open=resume', trigger: 'test', source: 'console', audience: { type: 'devices', deviceIds: [d.id] } } });
      flash(r.message.stats.sent ? `Test sent to ${d.profile?.teacher || 'phone'}` : 'Test not delivered. The phone may have turned reminders off.'); }
    catch (err) { flash(err.message); }
    t.disabled = false; refresh();
  }
  if (t.dataset.del) {
    const d = devices.find((x) => x.id === t.dataset.del);
    openModal(`<h2>Remove this phone?</h2><p class="sub">${esc(d.profile?.teacher || 'This phone')} will stop getting reminders until they turn them on again.</p><div class="acts" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="confirmDel">Remove</button></div>`);
    $('#confirmDel').onclick = async () => { await DRP.api('/api/devices/' + d.id, { method: 'DELETE' }); closeModal(); flash('Phone removed'); refresh(); };
  }
  if (t.dataset.edit) {
    const d = devices.find((x) => x.id === t.dataset.edit), p = d.profile || {};
    openModal(`<h2>Edit tags</h2><p class="sub">${esc(p.teacher || 'Phone')} · ${esc(d.ua?.label || '')}. Change these to move the phone between segments for the demo.</p>
      <form id="tagf"><div class="grid">
        <label class="f">Days inactive<input type="number" min="0" name="daysInactive" value="${p.daysInactive | 0}"></label>
        <label class="f">Streak (weeks)<input type="number" min="0" name="streak" value="${p.streak | 0}"></label>
        <label class="f">Books in theme<input type="number" min="0" max="3" name="booksDone" value="${p.booksDone | 0}"></label>
        <label class="f">Books lifetime<input type="number" min="0" name="totalBooks" value="${p.totalBooks | 0}"></label>
        <label class="f">Grade<select name="grade">${['Grade 1', 'Grade 2', 'Grade 3'].map((g) => `<option ${p.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="f">Activity pending<select name="activityPending"><option value="false">No</option><option value="true" ${p.activityPending ? 'selected' : ''}>Yes</option></select></label>
      </div><div class="acts" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save tags</button></div></form>`);
    $('#tagf').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      f.activityPending = f.activityPending === 'true';
      await DRP.api('/api/devices/' + d.id, { method: 'PATCH', body: { profile: f } });
      closeModal(); flash('Tags saved'); refresh();
    };
  }
});
$('#main').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr.click')) e.target.click(); });
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; m.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal)); }
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

async function refresh() {
  try {
    const [d, s, m, o] = await Promise.all([DRP.api('/api/devices'), DRP.api('/api/segments'), DRP.api('/api/messages?limit=40'), DRP.api('/api/overview')]);
    devices = d.devices; segments = s.segments; messages = m.messages; overview = o;
    if ($('#modal').hidden) render();
  } catch (e) { if (e.status === 401) location.reload(); }
}

async function start() {
  $('#appHost').textContent = location.host;
  window.addEventListener('hashchange', () => { $('#main').innerHTML = ''; render(); });
  $('#main').innerHTML = '<div class="empty">Loading…</div>';
  await refresh(); render();
  setInterval(() => { if (!document.hidden && view() !== 'new' && view() !== 'api') refresh(); }, 4000);
}
DRP.gate(start);
})();
