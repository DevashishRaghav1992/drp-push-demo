// DRP teacher site (demo). Vanilla JS, no build step.
(() => {
'use strict';

const THEMES = [
  { key: 'nature', name: "Let's Meet Nature", color: '#DCEFE0', ink: '#2F7A33', books: ['Bunty and Bubbly', 'Haathibhai', 'My First Book of Animals'], thread: 'Animals as friends: a rabbit duo, a friendly elephant, and a primer on creatures.' },
  { key: 'friends', name: 'Friendship and Kindness', color: '#FDE9D9', ink: '#B4530F', books: ['My Friends', 'See You Tomorrow', 'Smile Please'], thread: 'Friends, goodbyes, and shared smiles: the basics of being together.' },
  { key: 'food', name: 'Food Fun', color: '#FFF1C9', ink: '#8A6200', books: ['Hashim Saves the Mangoes', 'Amma, How Do You Make Ghee?', 'Aaloo-Maaloo-Kaaloo'], thread: 'Food from the kitchen and the harvest: mangoes saved, ghee made, and a rhyming feast.' },
  { key: 'places', name: "Let's Go Places!", color: '#E1ECF7', ink: '#1F5C99', books: ['Chhuk-Chhuk-Chhak', 'My First Book of Things That Go', 'Colours on the Street'], thread: 'Trains, vehicles, and city streets: the moving world just outside.' },
];
const PAGES = 4;
const KEY = 'drp-demo-state-v1';

// ── State (per phone, in this browser) ──
let S = load();
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
const theme = () => THEMES.find((t) => t.key === S.themeKey) || THEMES[0];
const curBook = () => theme().books[Math.min(S.booksDone, 2)];
const first = () => (S.teacher || 'Teacher').split(' ')[0];

function profile() {
  return { teacher: S.teacher, school: S.school, grade: S.grade, theme: theme().name, nextBook: curBook(), booksDone: S.booksDone, totalBooks: S.totalBooks, streak: S.streak, activityPending: S.activityPending };
}

// ── Helpers ──
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
  return data;
}
function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), ms); }
function sync(partial) { if (S && S.deviceId) api('/api/profile', { deviceId: S.deviceId, profile: partial }).catch(() => {}); }

// ── Push / reminders ──
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function uaInfo() {
  const u = navigator.userAgent;
  const platform = /android/i.test(u) ? 'Android' : isIOS ? 'iPhone' : /windows/i.test(u) ? 'Windows' : /mac os/i.test(u) ? 'Mac' : 'Other';
  const browser = /samsungbrowser/i.test(u) ? 'Samsung Internet' : /edg\//i.test(u) ? 'Edge' : /firefox|fxios/i.test(u) ? 'Firefox' : /crios|chrome/i.test(u) ? 'Chrome' : /safari/i.test(u) ? 'Safari' : 'Browser';
  return { platform, browser, standalone: standalone(), label: platform + ' · ' + (isIOS && standalone() ? 'Home Screen app' : browser) };
}
function b64ToU8(s) { const pad = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); }
function sameKey(sub, key) {
  try { const a = new Uint8Array(sub.options.applicationServerKey); const b = b64ToU8(key); return a.length === b.length && a.every((x, i) => x === b[i]); } catch (e) { return true; }
}
let swReady = null;
if ('serviceWorker' in navigator) swReady = navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready).catch(() => null);

async function pushState() {
  if (isIOS && !standalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await swReady;
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  if (sub && Notification.permission === 'granted') return 'on';
  return 'off';
}

async function enablePush() {
  const perm = await Notification.requestPermission(); // must be the first thing in the tap handler (iPhone)
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications were blocked. Allow them in the browser settings for this site.' : 'Permission was not given.');
  const { publicKey } = await api('/api/config');
  const reg = await swReady;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, publicKey)) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
  const r = await api('/api/subscribe', { subscription: sub.toJSON(), deviceId: S.deviceId, profile: { ...profile(), daysInactive: 0 }, ua: uaInfo() });
  S.deviceId = r.deviceId; save();
}

// Keep the server in step with this phone (it may have been cleaned up or the key rotated).
async function refreshRegistration() {
  try {
    if (await pushState() !== 'on') return;
    const { publicKey } = await api('/api/config');
    const reg = await swReady;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    if (!sameKey(sub, publicKey)) { await sub.unsubscribe(); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) }); }
    const r = await api('/api/subscribe', { subscription: sub.toJSON(), deviceId: S.deviceId, profile: profile(), ua: uaInfo() });
    if (r.deviceId !== S.deviceId) { S.deviceId = r.deviceId; save(); }
  } catch (e) { /* offline or server down: try again next load */ }
}

async function disablePush() {
  const reg = await swReady;
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) await sub.unsubscribe();
  if (S.deviceId) await api('/api/unsubscribe', { deviceId: S.deviceId }).catch(() => {});
  S.deviceId = null; save();
}

const SHARE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share icon" role="img" style="vertical-align:-3px"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"></path><path d="m16 6-4-4-4 4"></path><path d="M12 2v13"></path></svg>';

async function renderReminders(el, big) {
  el.innerHTML = '<div class="status"><span class="dot"></span>Checking reminders…</div>';
  const st = await pushState();
  el.className = 'card remind ' + (st === 'on' ? 'on' : 'off');
  if (st === 'on') {
    el.innerHTML = `
      <div class="status"><span class="dot ok"></span>Reminders are on for this phone</div>
      <p class="muted small" style="margin:0">They arrive even when this site is closed and the phone is locked.</p>
      <button class="btn teal" id="testBtn">Send me a test reminder</button>
      <p class="muted small" id="testNote" style="margin:0">It arrives 5 seconds after you tap, so you have time to lock your phone.</p>
      ${big ? '<button class="link" id="offBtn">Turn reminders off on this phone</button>' : ''}`;
    $('#testBtn', el).onclick = selfTest;
    if (big) $('#offBtn', el).onclick = async () => { await disablePush(); toast('Reminders turned off'); renderReminders(el, big); };
  } else if (st === 'off') {
    el.innerHTML = `
      <h3>Get a nudge when the next story is ready</h3>
      <p class="muted small" style="margin:0">At most one a day, and never outside school hours.</p>
      <button class="btn" id="onBtn">Turn on reminders</button>`;
    $('#onBtn', el).onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Turning on…';
      try { await enablePush(); toast('Reminders are on'); } catch (err) { toast(err.message, 6000); }
      renderReminders(el, big);
    };
  } else if (st === 'ios-install') {
    el.innerHTML = `
      <h3>Add to your Home Screen to get reminders</h3>
      <p class="muted small" style="margin:0">On iPhone, reminders work once this site is on your Home Screen.</p>
      <ol class="steps">
        <li>Tap the Share button ${SHARE_ICON} in Safari.</li>
        <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open <b>DRP Reading</b> from your Home Screen and tap <b>Turn on reminders</b>.</li>
      </ol>`;
  } else if (st === 'denied') {
    el.innerHTML = `
      <div class="status"><span class="dot bad"></span>Reminders are blocked</div>
      <p class="muted small" style="margin:0">Open your browser's settings for this site, allow <b>Notifications</b>, then reload this page.</p>`;
  } else {
    el.innerHTML = `
      <div class="status"><span class="dot warn"></span>This browser can't show reminders</div>
      <p class="muted small" style="margin:0">Use Chrome on Android, or Safari on iPhone after adding this site to your Home Screen.</p>`;
  }
}

async function selfTest(e) {
  const b = e.currentTarget, note = $('#testNote');
  b.disabled = true;
  let n = 5;
  const tick = () => { note.innerHTML = n > 0 ? `<b>Lock your phone now.</b> The reminder arrives in ${n}…` : 'Sending…'; };
  tick();
  const iv = setInterval(() => { n -= 1; tick(); if (n <= 0) clearInterval(iv); }, 1000);
  try {
    const r = await api('/api/self-test', { deviceId: S.deviceId, delay: 5 });
    note.textContent = r.ok ? 'Sent. Check your lock screen.' : 'Not delivered: ' + (r.error || 'unknown error');
  } catch (err) { note.textContent = err.message; }
  clearInterval(iv); b.disabled = false;
}

// ── Screens ──
const art = (t) => `<svg viewBox="0 0 120 80" aria-hidden="true"><circle cx="30" cy="30" r="14" fill="${t.ink}" opacity=".35"/><rect x="52" y="20" width="50" height="38" rx="8" fill="${t.ink}" opacity=".22"/><path d="M8 72 Q40 50 70 66 T116 60 V80 H8Z" fill="${t.ink}" opacity=".3"/></svg>`;
let fromReminder = null;

const screens = {
  welcome() {
    return `
      <section class="hero">
        <div class="kicker">Gujarat · Grades 1 to 3</div>
        <h1>Read together. Every class, every week.</h1>
        <p class="muted" style="margin:0">Illustrated stories with a read-along and a whole-class activity for each book.</p>
      </section>
      <form class="card" id="signin">
        <label class="f">Your name<input name="teacher" required autocomplete="name" placeholder="e.g. Priya Patel"></label>
        <label class="f">School<input name="school" required placeholder="e.g. GPS Mehsana"></label>
        <label class="f">Class<select name="grade"><option>Grade 1</option><option selected>Grade 2</option><option>Grade 3</option></select></label>
        <button class="btn" type="submit">Start reading</button>
      </form>
      <p class="foot">Demo platform for the Digital Reading Programme. No password needed.</p>`;
  },

  home() {
    const t = theme(), b = curBook();
    const opened = fromReminder ? `<div class="from"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"></path></svg><span>You opened this from a reminder. ${esc(fromReminder)}</span></div>` : '';
    let next;
    if (S.activityPending) {
      next = `<section class="card pending"><div class="kicker" style="color:var(--amber-ink)">One step left</div><h2 style="font-size:22px">Submit the activity for ${esc(b)}</h2><p class="small" style="margin:0">Your class finished the story. Pick the answer most of the class gave.</p><a class="btn" href="#activity">Submit activity</a></section>`;
    } else if (S.booksDone >= 3) {
      next = `<section class="card"><div class="kicker">Theme complete</div><h2 style="font-size:22px">Pick the next theme with your class</h2><a class="btn" href="#themes">Choose a theme</a></section>`;
    } else {
      next = `<section class="card next"><div class="art" style="background:${t.color};position:relative">${art(t).replace('<svg ', '<svg style="position:absolute;right:16px;top:12px;width:150px" ')}<span style="position:relative">${esc(t.name)}</span></div><div class="body"><div class="kicker">Today's story · Book ${S.booksDone + 1} of 3</div><h2>${esc(b)}</h2><p class="muted small" style="margin:0">Read-along first, then talk about the pictures. About 20 minutes with the activity.</p><a class="btn" href="#read">Begin today's story</a></div></section>`;
    }
    const books = t.books.map((name, i) => `<div class="book ${i < S.booksDone ? 'done' : i === S.booksDone && !S.activityPending ? 'next' : ''}"><div class="cv" style="background:${i < S.booksDone ? t.color : '#F1E7D8'}"></div>${esc(name)}</div>`).join('');
    return `
      ${opened}
      <section class="greet"><h1>Hello, ${esc(first())}</h1><p class="muted" style="margin:4px 0 0">${esc(S.grade)} · ${esc(S.school)}</p></section>
      <div class="chips"><span class="chip">${S.streak ? S.streak + '-week streak' : 'Start a streak this week'}</span><span class="chip">${S.totalBooks} ${S.totalBooks === 1 ? 'book' : 'books'} read</span></div>
      ${next}
      <section class="card"><div class="row" style="justify-content:space-between"><h3 style="font-size:18px">${esc(t.name)}</h3><span class="muted small">${S.booksDone} of 3 done</span></div><div class="bar"><i style="width:${(S.booksDone / 3) * 100}%"></i></div><div class="books">${books}</div><a href="#themes" class="small" style="font-weight:600">Change theme</a></section>
      <section class="card remind" id="remind"></section>`;
  },

  read() {
    const t = theme(), p = S.readerPage || 0;
    const last = p >= PAGES - 1;
    return `
      <div class="row" style="justify-content:space-between"><a href="#home" class="small" style="font-weight:600">← Dashboard</a><span class="muted small">${esc(t.name)} · Book ${S.booksDone + 1} of 3</span></div>
      <h1 style="font-size:26px">${esc(curBook())}</h1>
      <section class="card reader">
        <div class="page" style="background:${t.color}">${art(t)}<span class="no">Page ${p + 1} of ${PAGES}</span></div>
        <div class="txt muted">Story page ${p + 1}. In the live programme the book's pages and read-along appear here.</div>
        <div class="nav">
          <button class="btn ghost" id="prev" ${p === 0 ? 'disabled' : ''}>Back</button>
          <button class="btn" id="nextp">${last ? 'Finish story' : 'Next page'}</button>
        </div>
      </section>`;
  },

  activity() {
    return `
      <div class="row" style="justify-content:space-between"><a href="#home" class="small" style="font-weight:600">← Dashboard</a><span class="muted small">Class activity</span></div>
      <h1 style="font-size:26px">Your class read ${esc(curBook())}. What did they say?</h1>
      <form class="card" id="act">
        <p style="margin:0">Ask the class: <i>"Which part of the story did you like most?"</i> Pick the answer most children gave.</p>
        <fieldset>
          <legend class="muted small" style="margin-bottom:8px">Most of the class said…</legend>
          <label class="opt"><input type="radio" name="a" value="start"> The beginning</label>
          <label class="opt"><input type="radio" name="a" value="middle"> The middle</label>
          <label class="opt"><input type="radio" name="a" value="end"> The ending</label>
          <label class="opt"><input type="radio" name="a" value="none"> The class couldn't agree</label>
        </fieldset>
        <p class="muted small" style="margin:0">There's no wrong answer. This tells us the class took part.</p>
        <button class="btn" type="submit" id="submitAct" disabled>Submit and finish the book</button>
        <a href="#home" class="small" style="text-align:center;font-weight:600">I'll do it later</a>
      </form>`;
  },

  done() {
    const t = theme();
    const nextName = t.books[S.booksDone];
    return `
      <section class="card" style="text-align:center;align-items:center;padding:28px 18px">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--leaf);display:flex;align-items:center;justify-content:center"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"></path></svg></div>
        <h1 style="font-size:26px">Book complete</h1>
        <p class="muted" style="margin:0">${esc(t.books[S.booksDone - 1])} is done. ${S.booksDone} of 3 in ${esc(t.name)}.</p>
        ${nextName ? `<p style="margin:0">Next up: <b>${esc(nextName)}</b></p>` : ''}
        <a class="btn" href="#home">Back to dashboard</a>
      </section>`;
  },

  celebrate() {
    const t = theme();
    return `
      <section class="card celebrate">
        <div class="kicker" style="color:#9FDCD8">Theme complete · ${esc(S.grade)}</div>
        <div class="badge" aria-hidden="true"></div>
        <h1 style="font-size:28px">You finished ${esc(t.name)}!</h1>
        <p class="muted" style="margin:0">The thread that connects the three stories:</p>
        <blockquote>${esc(t.thread)}</blockquote>
        <a class="btn" href="#themes" style="background:#fff;color:#1F2A2A">Pick the next theme</a>
      </section>`;
  },

  themes() {
    return `
      <div class="row" style="justify-content:space-between"><a href="#home" class="small" style="font-weight:600">← Dashboard</a></div>
      <h1 style="font-size:26px">What would ${esc(S.grade)} like to read about?</h1>
      <p class="muted" style="margin:0">Ask your class. Each theme opens three books.</p>
      <div class="themes">${THEMES.map((t) => `<button class="theme" data-k="${t.key}"><span class="sw" style="background:${t.color}"></span><span><b>${esc(t.name)}</b><span>${esc(t.books.join(' · '))}</span></span></button>`).join('')}</div>`;
  },

  settings() {
    return `
      <div class="row" style="justify-content:space-between"><a href="#home" class="small" style="font-weight:600">← Dashboard</a></div>
      <h1 style="font-size:26px">Reminders</h1>
      <section class="card remind" id="remind"></section>
      <section class="card">
        <h3 style="font-size:18px">If reminders don't arrive</h3>
        <ul class="steps">
          <li>Allow notifications for your browser in the phone's Settings, including on the lock screen.</li>
          <li>Turn off Do Not Disturb or Focus.</li>
          <li>On iPhone, open DRP Reading from the Home Screen icon, not from Safari.</li>
          <li>Battery saver can delay reminders on some Android phones.</li>
        </ul>
      </section>
      <section class="card">
        <p class="small muted" style="margin:0">Signed in as <b>${esc(S.teacher)}</b>, ${esc(S.grade)}, ${esc(S.school)}.${S.deviceId ? ' Phone ID ' + esc(S.deviceId) + '.' : ''}</p>
        <button class="btn ghost" id="signout">Sign out and reset this demo</button>
      </section>`;
  },
};

// ── Router ──
function route() {
  const h = (location.hash || '#home').slice(1);
  if (!S) return 'welcome';
  return screens[h] && h !== 'welcome' ? h : 'home';
}
function render() {
  const r = route();
  $('#app').innerHTML = screens[r]();
  $('#settingsBtn').hidden = !S;
  window.scrollTo(0, 0);
  bind(r);
}
function bind(r) {
  if (r === 'welcome') {
    $('#signin').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      S = { teacher: f.get('teacher').trim(), school: f.get('school').trim(), grade: f.get('grade'), themeKey: 'nature', booksDone: 0, totalBooks: 0, streak: 0, activityPending: false, deviceId: null, readerPage: 0, lastWeek: null };
      save(); location.hash = '#home'; render();
    };
  }
  if (r === 'home' || r === 'settings') renderReminders($('#remind'), r === 'settings');
  if (r === 'read') {
    $('#prev').onclick = () => { S.readerPage = Math.max(0, (S.readerPage || 0) - 1); save(); render(); };
    $('#nextp').onclick = () => {
      if ((S.readerPage || 0) >= PAGES - 1) {
        S.readerPage = 0; S.activityPending = true; save();
        sync({ activityPending: true, daysInactive: 0 });
        location.hash = '#activity';
      } else { S.readerPage = (S.readerPage || 0) + 1; save(); render(); }
    };
  }
  if (r === 'activity') {
    const form = $('#act');
    form.onchange = () => { $('#submitAct').disabled = !form.querySelector('input:checked'); };
    form.onsubmit = (e) => {
      e.preventDefault();
      const wk = weekKey();
      if (S.lastWeek !== wk) { S.streak = S.lastWeek === prevWeekKey() ? S.streak + 1 : 1; S.lastWeek = wk; }
      S.booksDone += 1; S.totalBooks += 1; S.activityPending = false; save();
      sync({ ...profile(), daysInactive: 0 });
      location.hash = S.booksDone >= 3 ? '#celebrate' : '#done';
    };
  }
  if (r === 'themes') {
    document.querySelectorAll('.theme').forEach((b) => (b.onclick = () => {
      S.themeKey = b.dataset.k; S.booksDone = 0; S.activityPending = false; S.readerPage = 0; save();
      sync(profile()); location.hash = '#home';
    }));
  }
  if (r === 'settings') {
    $('#signout').onclick = async () => { await disablePush().catch(() => {}); S = null; try { localStorage.removeItem(KEY); } catch (e) {} location.hash = ''; render(); };
  }
}
function weekKey(d = new Date()) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-' + Math.ceil(((t - y) / 864e5 + 1) / 7); }
function prevWeekKey() { const d = new Date(); d.setDate(d.getDate() - 7); return weekKey(d); }

// Deep links from notifications: /?open=activity&m=<message id>
(function handleDeepLink() {
  const q = new URLSearchParams(location.search);
  const open = q.get('open');
  if (!open) return;
  fromReminder = { resume: 'Here is where your class left off.', activity: 'Here is the activity waiting for you.', themes: 'Pick the next theme here.', celebrate: 'Your class finished a theme.', progress: "Here is your class's progress." }[open] || '';
  let target = '#home';
  if (S) {
    if (open === 'activity' && !S.activityPending) fromReminder = 'Your next story is ready.';
    if (open === 'activity') target = S.activityPending ? '#activity' : '#home';
    else if (open === 'themes') target = '#themes';
    else if (open === 'celebrate') target = S.booksDone >= 3 ? '#celebrate' : '#home';
  }
  history.replaceState(null, '', '/' + target);
})();

$('#settingsBtn').onclick = () => { location.hash = '#settings'; };
window.addEventListener('hashchange', () => { if (route() !== 'home') fromReminder = null; render(); });
render();
if (S) refreshRegistration();
})();
