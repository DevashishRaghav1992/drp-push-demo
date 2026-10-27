// Trigger library shared by the Nudge Studio and the push console.
window.DRP = window.DRP || {};

DRP.STAGES = { activation: 'Getting started', progress: 'Mid-journey', lapse: 'Drop-off', celebrate: 'Celebration' };

DRP.LINKS = {
  resume: { label: 'Resume dashboard (current book)', url: '/?open=resume' },
  activity: { label: 'Pending activity', url: '/?open=activity' },
  themes: { label: 'Theme picker', url: '/?open=themes' },
  celebrate: { label: 'Celebration screen', url: '/?open=celebrate' },
  progress: { label: 'Progress', url: '/?open=progress' },
};

DRP.TRIGGERS = [
  { id: 'A1', stage: 'activation', name: 'Enrolled, no first session', rule: 'Enrolled 24h ago, no book finished', segment: 'not_started', channels: ['push', 'whatsapp'],
    title: "{class}'s first story is ready", body: 'Hi {teacher}, your first story is waiting. One session is about 20 minutes.', cta: 'Open first story', link: 'resume',
    wa: { h: 'Your first DRP story is ready', b: "Hi {teacher}, {class} is all set up on the Digital Reading Programme. Your first story is waiting. One session takes about 20 minutes.", qr: ['Start today', 'Show me how'] } },
  { id: 'A2', stage: 'activation', name: 'Theme not picked', rule: 'Left the theme screen without choosing', segment: 'not_started', channels: ['push'],
    title: 'Pick a theme with your class', body: "Ask {class} what they'd like to read about. The first three books open right away.", cta: 'Choose a theme', link: 'themes',
    wa: { h: 'One choice left', b: 'Hi {teacher}, pick a theme with {class} and your first three books open right away.', qr: ['Choose a theme'] } },
  { id: 'P1', stage: 'progress', name: 'Activity not submitted', rule: 'Story read, activity pending 2h', segment: 'activity_pending', channels: ['push'],
    title: 'One step left for {book}', body: "{class} finished the story. Submit today's activity to mark it complete. It takes a minute.", cta: 'Submit activity', link: 'activity',
    wa: { h: 'One step left', b: '{class} finished {book}. Submit the class activity to mark it complete. It takes a minute.', qr: ['Submit now'] } },
  { id: 'P2', stage: 'progress', name: 'Next book waiting', rule: 'Mid-theme, no session for 2 days', segment: 'mid_theme', channels: ['push'],
    title: '{book} is up next', body: '{class} is {left} away from finishing {theme}. Pick up where you left off.', cta: 'Continue reading', link: 'resume',
    wa: { h: '{book} is up next', b: 'Hi {teacher}, {class} is {left} away from finishing {theme}.', qr: ['Continue reading'] } },
  { id: 'P3', stage: 'progress', name: 'Streak at risk', rule: 'Read every week, nothing yet this week', segment: 'streak', channels: ['push'],
    title: "Keep {class}'s {streak}-week streak going", body: 'One story before Saturday keeps your reading streak alive.', cta: "Read this week's story", link: 'resume',
    wa: { h: '{streak} weeks in a row', b: "Hi {teacher}, one story before Saturday keeps {class}'s reading streak alive.", qr: ['Read today'] } },
  { id: 'L1', stage: 'lapse', name: 'Quiet for 3 days', rule: 'No session for 3 days', segment: 'inactive_3', channels: ['push'],
    title: '{class} misses story time', body: "It's been {days} days. {book} of {theme} is ready whenever you are.", cta: 'Open next story', link: 'resume',
    wa: { h: 'Story time?', b: "Hi {teacher}, it's been {days} days. {book} of {theme} is ready whenever you are.", qr: ['Open story'] } },
  { id: 'L2', stage: 'lapse', name: 'Quiet for 7 days', rule: 'No session for 7 days', segment: 'inactive_7', channels: ['push', 'whatsapp'],
    title: '{class} is {left} from a badge', body: 'Hi {teacher}, everything is saved. Pick up exactly where you left off.', cta: 'Resume reading', link: 'resume',
    wa: { h: "{class}'s reading journey is waiting", b: 'Hi {teacher}, {class} is {left} away from completing {theme} and earning its badge. Everything is saved.', qr: ['Resume this week', 'Remind me Monday'] } },
  { id: 'L3', stage: 'lapse', name: "Quiet 21 days: what's in the way?", rule: 'No session for 21 days', segment: 'inactive_21', channels: ['whatsapp', 'push'],
    title: "What's getting in the way?", body: "Hi {teacher}, {class} hasn't read in a while. Tap to tell us, and we'll help.", cta: 'Tell us', link: 'resume',
    wa: { h: 'Can we help?', b: "Hi {teacher}, {class} hasn't read on DRP for {days} days. What's getting in the way? Tap one and we'll help sort it.", qr: ['Room not free', 'Not enough time', 'Technical problem'] } },
  { id: 'C1', stage: 'celebrate', name: 'Theme complete', rule: 'Third book activity submitted', segment: 'all', channels: ['push', 'whatsapp'],
    title: '{class} finished {theme}!', body: 'Three stories, three activities. Your class earned the {theme} badge.', cta: 'See the badge', link: 'celebrate',
    wa: { h: 'Badge earned', b: 'Well done, {teacher}! {class} completed {theme} and earned its badge.', qr: ['Share badge', 'Pick next theme'] } },
  { id: 'C2', stage: 'celebrate', name: 'Weekly recap', rule: 'Friday 4pm, active classes', segment: 'all', channels: ['push'],
    title: 'Your week with {class}', body: '{streak}-week streak and counting. Thank you for making time for stories.', cta: 'See your week', link: 'progress',
    wa: { h: 'Your reading week', b: "Hi {teacher}, here's {class}'s week: {streak}-week streak and counting.", qr: ['See full recap'] } },
];

// Mirrors the server's segment rules, for previews and caps in the browser.
DRP.SEGMENT_TESTS = {
  all: () => true,
  not_started: (p) => (p.totalBooks | 0) === 0,
  activity_pending: (p) => p.activityPending === true,
  mid_theme: (p) => (p.booksDone | 0) >= 1 && (p.booksDone | 0) <= 2 && !p.activityPending,
  inactive_3: (p) => (p.daysInactive | 0) >= 3,
  inactive_7: (p) => (p.daysInactive | 0) >= 7,
  inactive_21: (p) => (p.daysInactive | 0) >= 21,
  streak: (p) => (p.streak | 0) >= 2,
  grade_1: (p) => p.grade === 'Grade 1',
  grade_2: (p) => p.grade === 'Grade 2',
  grade_3: (p) => p.grade === 'Grade 3',
};

DRP.SAMPLE_PROFILE ={ teacher: 'Priya Patel', school: 'GPS Mehsana', grade: 'Grade 2', theme: "Let's Meet Nature", nextBook: 'Haathibhai', booksDone: 1, totalBooks: 4, daysInactive: 8, streak: 4, activityPending: false };

// Same substitution the server uses.
DRP.fill = function (tpl, p) {
  p = p || {};
  const left = Math.max(0, 3 - (p.booksDone | 0));
  const vars = {
    teacher: (p.teacher || 'Teacher').split(' ')[0], class: p.grade || 'your class', theme: p.theme || 'your theme',
    book: p.nextBook || 'the next story', left: left === 1 ? '1 story' : (left || 3) + ' stories',
    days: String(p.daysInactive | 0), streak: String(p.streak | 0), school: p.school || 'your school',
  };
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
};

DRP.esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Admin API with the passcode kept in this browser.
DRP.key = () => { try { return localStorage.getItem('drp-admin-key') || ''; } catch (e) { return DRP._key || ''; } };
DRP.setKey = (k) => { DRP._key = k; try { localStorage.setItem('drp-admin-key', k); } catch (e) {} };
DRP.api = async function (path, opts) {
  opts = opts || {};
  const r = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', 'x-admin-key': DRP.key() }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Request failed (' + r.status + ')'); e.status = r.status; throw e; }
  return data;
};
DRP.ago = function (iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 10) return 'just now'; if (s < 60) return s + 's ago'; if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago';
};

// Passcode gate: shows a small dialog until the API accepts the passcode.
DRP.gate = async function (onReady) {
  const tryKey = async () => { try { const r = await DRP.api('/api/admin-check'); onReady(r); return true; } catch (e) { if (e.status === 401) return false; throw e; } };
  try { if (await tryKey()) return; } catch (e) { /* network error: still show the dialog */ }
  const d = document.createElement('div');
  d.innerHTML = '<div style="position:fixed;inset:0;background:rgba(20,16,12,.55);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px"><form style="background:#fff;color:#2B2118;border-radius:16px;padding:24px;max-width:380px;width:100%;font:15px/1.5 Inter,system-ui,sans-serif;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.3)"><b style="font-size:18px">Enter the demo passcode</b><span style="color:#5E5247;font-size:14px">The default is <code>drp-demo</code> unless you set ADMIN_PASSCODE on Netlify.</span><label style="display:flex;flex-direction:column;gap:4px;font-weight:600;font-size:13px">Passcode<input type="password" autocomplete="current-password" required style="font:inherit;padding:10px 12px;border:1px solid #EADFCF;border-radius:10px"></label><span class="err" style="color:#B42318;font-size:13.5px"></span><button style="font:inherit;font-weight:700;padding:12px;border:0;border-radius:10px;background:#2B2118;color:#fff;cursor:pointer">Continue</button></form></div>';
  document.body.appendChild(d);
  const f = d.querySelector('form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    DRP.setKey(f.querySelector('input').value.trim());
    try { if (await tryKey()) d.remove(); else f.querySelector('.err').textContent = 'That passcode was not accepted.'; }
    catch (err) { f.querySelector('.err').textContent = 'Could not reach the server: ' + err.message; }
  };
};
