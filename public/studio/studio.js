// DRP Nudge Studio: composes nudges and sends them through the push API.
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const { TRIGGERS, STAGES, LINKS, fill, esc } = DRP;

let current = TRIGGERS[0];
let stageFilter = 'all';
let devices = [];
let segments = [];
let messages = [];
let knownIds = null;
let pending = []; // scheduled sends shown in the log before they go out

function flash(txt, ms = 3600) { const el = $('#toastmsg'); el.textContent = txt; el.style.display = 'block'; clearTimeout(flash.t); flash.t = setTimeout(() => (el.style.display = 'none'), ms); }

// ── Connect a phone ──
function renderQR() {
  const url = location.origin + '/';
  $('#siteUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  $('#siteUrl').href = url;
  if (window.qrcode) {
    const q = window.qrcode(0, 'M'); q.addData(url); q.make();
    $('#qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } else {
    $('#qr').innerHTML = '<span class="hint" style="margin:0;text-align:center">QR unavailable offline. Type the address instead.</span>';
  }
}

function renderPhones() {
  const ul = $('#phones');
  $('#phoneCount').innerHTML = `<span class="dot ${devices.length ? 'ok' : ''}"></span>${devices.length} ${devices.length === 1 ? 'phone' : 'phones'}`;
  if (!devices.length) { ul.innerHTML = '<li class="empty">Waiting for the first phone… Scan the code above.</li>'; return; }
  const fresh = knownIds ? devices.filter((d) => !knownIds.has(d.id)).map((d) => d.id) : [];
  ul.innerHTML = devices.map((d) => {
    const p = d.profile || {};
    const tags = [p.grade, p.activityPending ? 'activity pending' : null, (p.daysInactive | 0) ? `${p.daysInactive}d quiet` : null, (p.streak | 0) ? `${p.streak}w streak` : null].filter(Boolean);
    return `<li class="${fresh.includes(d.id) ? 'new' : ''}"><span class="who">${esc(p.teacher || 'Unnamed')}</span><span class="meta">${esc(d.ua?.label || 'Phone')} · ${esc(DRP.ago(d.lastSeen))}</span><span class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span></li>`;
  }).join('');
  if (fresh.length && knownIds) flash(`New phone connected: ${devices.find((d) => d.id === fresh[0])?.profile?.teacher || 'a teacher'}`);
  knownIds = new Set(devices.map((d) => d.id));
}

// ── Triggers ──
function renderFilters() {
  $('#filters').innerHTML = ['all', ...Object.keys(STAGES)].map((k) => `<button data-k="${k}" class="${k === stageFilter ? 'on' : ''}">${k === 'all' ? 'All' : STAGES[k]}</button>`).join('');
}
function segName(id) { return (segments.find((s) => s.id === id) || {}).name || id; }
function renderTriggers() {
  $('#triggers').innerHTML = TRIGGERS.filter((t) => stageFilter === 'all' || t.stage === stageFilter).map((t) => `
    <button class="trig ${t.id === current.id ? 'on' : ''}" data-id="${t.id}">
      <span class="stage s-${t.stage}">${STAGES[t.stage]}</span>
      <span class="name">${esc(t.name)}</span>
      <span class="rule">${esc(t.rule)}</span>
      <span class="aud">→ ${esc(segName(t.segment))}</span>
    </button>`).join('');
}
function loadTrigger(t) {
  current = t;
  $('#e_title').value = t.title; $('#e_body').value = t.body; $('#e_cta').value = t.cta; $('#e_link').value = t.link;
  $('#trigRule').innerHTML = `<b>${t.id} · ${esc(t.name)}.</b> Fires when: ${esc(t.rule.toLowerCase())}. Default audience: ${esc(segName(t.segment))}.`;
  $$('#chanChecks input').forEach((i) => (i.checked = i.value === 'push' || (i.value === 'whatsapp' && t.channels[0] === 'whatsapp')));
  renderAudience(`seg:${t.segment}`);
  renderTriggers(); renderPreview(); renderGuard();
  setTab($('#chanChecks input[value=whatsapp]').checked && !$('#chanChecks input[value=push]').checked ? 'whatsapp' : 'lock');
}

// ── Audience ──
function renderAudience(select) {
  const sel = $('#aud');
  const keep = select || sel.value;
  const segOpts = (segments.length ? segments : [{ id: 'all', name: 'All subscribers', count: devices.length }]).map((s) => `<option value="seg:${s.id}">${esc(s.name)} · ${s.count} ${s.count === 1 ? 'phone' : 'phones'}</option>`).join('');
  const devOpts = devices.map((d) => `<option value="dev:${d.id}">${esc(d.profile?.teacher || 'Unnamed')} · ${esc(d.ua?.label || 'Phone')}</option>`).join('');
  sel.innerHTML = `<optgroup label="Segments">${segOpts}</optgroup>${devOpts ? `<optgroup label="One phone">${devOpts}</optgroup>` : ''}`;
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
function targets() {
  const v = $('#aud').value || 'seg:all';
  if (v.startsWith('dev:')) return devices.filter((d) => d.id === v.slice(4));
  const test = DRP.SEGMENT_TESTS[v.slice(4)] || (() => true);
  return devices.filter((d) => test(d.profile || {}));
}
function audiencePayload() {
  const v = $('#aud').value || 'seg:all';
  return v.startsWith('dev:') ? { type: 'devices', deviceIds: [v.slice(4)] } : { type: 'segment', segment: v.slice(4) };
}

// ── Preview ──
function previewProfile() { const t = targets(); return t[0] ? { p: t[0].profile || {}, d: t[0] } : { p: DRP.SAMPLE_PROFILE, d: null }; }
function renderPreview() {
  const { p, d } = previewProfile();
  $('#pv_title').textContent = fill($('#e_title').value, p);
  $('#pv_body').textContent = fill($('#e_body').value, p);
  $('#pv_cta').textContent = fill($('#e_cta').value, p);
  $('#pv_as').textContent = d ? `Previewing as ${p.teacher || 'this teacher'} (${d.ua?.label || 'phone'}). Each phone gets its own name, class and book.` : 'Previewing with a sample teacher. Connect a phone to preview real details.';
  $('#pv_wa_h').textContent = fill(current.wa.h, p);
  $('#pv_wa_b').textContent = fill(current.wa.b, p);
  $('#pv_wa_qr').innerHTML = current.wa.qr.map((q) => `<span>${esc(fill(q, p))}</span>`).join('');
  const now = new Date();
  $('#pv_time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
  $('#pv_date').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  ['#pv_notif', '#pv_wa'].forEach((s) => { const el = $(s); el.style.animation = 'none'; void el.offsetHeight; el.style.animation = ''; });
}
function setTab(p) { $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.p === p)); $$('.pane').forEach((el) => el.classList.toggle('on', el.dataset.p === p)); }

// ── Guardrails ──
function guardrails() {
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60, day = now.getDay();
  const chans = $$('#chanChecks input:checked').map((i) => i.value);
  const t = targets();
  const out = [];
  const inHours = day !== 0 && h >= 8 && h < 18;
  out.push({ ok: inHours, txt: inHours ? 'Inside school hours (Mon–Sat, 8am–6pm)' : `Outside school hours. Production would hold this until ${day === 0 || (day === 6 && h >= 18) ? 'Monday' : 'tomorrow'} 8:30am.` });
  if (chans.includes('push')) {
    if (!t.length) out.push({ ok: false, hard: true, txt: 'No phones match this audience yet. Pick "All subscribers" or one phone.' });
    else {
      const today = new Date().toDateString();
      const got = new Set();
      messages.filter((m) => m.source !== 'self-test' && new Date(m.createdAt).toDateString() === today).forEach((m) => m.results.forEach((r) => r.ok && got.add(r.deviceId)));
      const hit = t.filter((d) => got.has(d.id)).length;
      out.push({ ok: hit === 0, txt: hit === 0 ? `Push cap: none of the ${t.length} ${t.length === 1 ? 'phone has' : 'phones have'} had a nudge today` : `Push cap (1 a day): ${hit} of ${t.length} already had a nudge today and would be skipped` });
    }
  }
  if (current.id === 'L1' && chans.includes('whatsapp')) out.push({ ok: false, txt: 'Escalation order: a 3-day lapse tries push first. WhatsApp is for 7+ days.' });
  if (!chans.length) out.push({ ok: false, hard: true, txt: 'Pick at least one channel.' });
  return out;
}
function renderGuard() {
  $('#guard').innerHTML = '<b style="font-size:12.5px;color:var(--ink-2)">GUARDRAILS</b>' + guardrails().map((g) => `<div class="g"><span class="ic ${g.ok ? 'ok' : 'hold'}">${g.ok ? '✓' : '‖'}</span><span>${esc(g.txt)}</span></div>`).join('');
}

// ── Send ──
async function send() {
  const chans = $$('#chanChecks input:checked').map((i) => i.value);
  const g = guardrails();
  const hard = g.find((x) => x.hard && !x.ok);
  if (hard) return flash(hard.txt);
  if (!$('#override').checked && g.some((x) => !x.ok)) return flash('Held by guardrails. Tick "Ignore guardrails for the demo" to send anyway.');
  if (chans.includes('whatsapp')) setTab('whatsapp');
  if (!chans.includes('push')) return flash('WhatsApp preview updated. Tap "Open in WhatsApp" to send it to a phone.');
  const body = {
    title: $('#e_title').value, body: $('#e_body').value, cta: $('#e_cta').value,
    url: (LINKS[$('#e_link').value] || LINKS.resume).url, trigger: current.id, audience: audiencePayload(), source: 'studio',
  };
  const label = $('#aud').selectedOptions[0]?.textContent || '';
  const delay = +$('#e_delay').value;
  const job = { id: 'p' + Date.now(), title: body.title, trigger: current.id, label, due: Date.now() + delay * 1000 };
  pending.push(job); renderLog();
  const iv = setInterval(renderLog, 1000);
  if (delay) flash(`Sending in ${delay} seconds. Lock the phone now.`);
  setTimeout(async () => {
    try {
      const r = await DRP.api('/api/send', { body });
      const s = r.message.stats;
      flash(s.targeted === 0 ? 'No phones matched this audience.' : s.sent === s.targeted ? `Sent to ${s.sent} ${s.sent === 1 ? 'phone' : 'phones'}.` : `Sent to ${s.sent} of ${s.targeted}. Some phones no longer accept reminders.`);
    } catch (e) { flash('Send failed: ' + e.message, 6000); }
    pending = pending.filter((p) => p !== job); clearInterval(iv);
    await refresh();
  }, delay * 1000);
}

// ── Log ──
function renderLog() {
  const ul = $('#log');
  const rows = pending.map((p) => `<li><span class="t">${Math.max(0, Math.ceil((p.due - Date.now()) / 1000))}s</span><span class="m">${esc(p.trigger)} · ${esc(p.title)}</span><span class="a">${esc(p.label)}</span><span class="st"><span class="pill wait">Scheduled</span></span></li>`);
  rows.push(...messages.filter((m) => m.source !== 'self-test').slice(0, 12).map((m) => {
    const s = m.stats;
    return `<li><span class="t">${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span class="m">${esc(m.trigger || '—')} · ${esc(m.title)}</span><span class="a">${esc(m.audience.label)} · ${esc(m.source)}</span><span class="st">
      <span class="pill ${s.targeted && s.sent === s.targeted ? 'good' : s.sent ? 'wait' : 'bad'}">Sent ${s.sent}/${s.targeted}</span>
      <span class="pill ${s.shown ? 'info' : ''}">Shown ${s.shown}</span>
      <span class="pill ${s.clicked ? 'good' : ''}">Opened ${s.clicked}</span></span></li>`;
  }));
  ul.innerHTML = rows.length ? rows.join('') : '<li class="empty">Nothing sent yet.</li>';
}

// ── Polling ──
async function refresh() {
  try {
    const [d, s, m] = await Promise.all([DRP.api('/api/devices'), DRP.api('/api/segments'), DRP.api('/api/messages?limit=15')]);
    devices = d.devices; segments = s.segments; messages = m.messages;
    renderPhones(); renderAudience(); renderTriggers(); renderLog(); renderGuard();
    if (!$('#e_title').matches(':focus') && !$('#e_body').matches(':focus')) renderPreview();
  } catch (e) { if (e.status === 401) location.reload(); }
}

// ── WhatsApp click-to-chat ──
function openWhatsApp() {
  const num = ($('#waNum').value || '').replace(/\D/g, '');
  if (num.length < 10) return flash('Enter a WhatsApp number with country code, e.g. 9198XXXXXXXX');
  try { localStorage.setItem('drp-wa', num); } catch (e) {}
  const { p } = previewProfile();
  const text = `*${fill(current.wa.h, p)}*\n\n${fill(current.wa.b, p)}\n\n${current.wa.qr.map((q) => '▸ ' + fill(q, p)).join('\n')}\n\n_Pratham Books · StoryWeaver_`;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

// ── Wire up ──
function start() {
  $('#e_link').innerHTML = Object.entries(LINKS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  renderQR(); renderFilters(); loadTrigger(TRIGGERS[0]);
  $('#filters').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stageFilter = b.dataset.k; renderFilters(); renderTriggers(); });
  $('#triggers').addEventListener('click', (e) => { const b = e.target.closest('.trig'); if (b) loadTrigger(TRIGGERS.find((t) => t.id === b.dataset.id)); });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.p); });
  ['#e_title', '#e_body', '#e_cta'].forEach((s) => $(s).addEventListener('input', renderPreview));
  $('#aud').addEventListener('change', () => { renderPreview(); renderGuard(); });
  $$('#chanChecks input').forEach((i) => i.addEventListener('change', () => { renderGuard(); setTab(i.value === 'whatsapp' && i.checked ? 'whatsapp' : 'lock'); }));
  $$('.vars button').forEach((b) => b.addEventListener('click', () => {
    const ta = $('#e_body'), pos = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, pos) + b.textContent + ta.value.slice(pos); ta.focus(); renderPreview();
  }));
  $('#sendBtn').onclick = send;
  $('#waBtn').onclick = openWhatsApp;
  try { $('#waNum').value = localStorage.getItem('drp-wa') || ''; } catch (e) {}
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 3000);
}

DRP.gate(start);
})();
