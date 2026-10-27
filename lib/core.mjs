// DRP Push — a small OneSignal-style push service.
// Storage-agnostic: the Netlify Function passes a Blobs-backed store,
// the local dev server passes a file-backed one.
import webpush from 'web-push';
import { createHash, randomBytes } from 'node:crypto';

// ── Segments: shared by the console and the studio ────────────────
export const SEGMENTS = [
  { id: 'all', name: 'All subscribers', rule: 'Everyone with reminders on', test: () => true },
  { id: 'not_started', name: 'Not started', rule: 'No book finished yet', test: (p) => (p.totalBooks | 0) === 0 },
  { id: 'activity_pending', name: 'Activity pending', rule: 'Story read, activity not submitted', test: (p) => p.activityPending === true },
  { id: 'mid_theme', name: 'Mid-theme', rule: '1 or 2 books done in the current theme', test: (p) => (p.booksDone | 0) >= 1 && (p.booksDone | 0) <= 2 && !p.activityPending },
  { id: 'inactive_3', name: 'Quiet 3+ days', rule: 'days_inactive ≥ 3', test: (p) => (p.daysInactive | 0) >= 3 },
  { id: 'inactive_7', name: 'Quiet 7+ days', rule: 'days_inactive ≥ 7', test: (p) => (p.daysInactive | 0) >= 7 },
  { id: 'inactive_21', name: 'Quiet 21+ days', rule: 'days_inactive ≥ 21', test: (p) => (p.daysInactive | 0) >= 21 },
  { id: 'streak', name: 'On a streak', rule: 'streak_weeks ≥ 2', test: (p) => (p.streak | 0) >= 2 },
  { id: 'grade_1', name: 'Grade 1', rule: 'grade = Grade 1', test: (p) => p.grade === 'Grade 1' },
  { id: 'grade_2', name: 'Grade 2', rule: 'grade = Grade 2', test: (p) => p.grade === 'Grade 2' },
  { id: 'grade_3', name: 'Grade 3', rule: 'grade = Grade 3', test: (p) => p.grade === 'Grade 3' },
];

const PROFILE_FIELDS = ['teacher', 'school', 'grade', 'theme', 'nextBook', 'booksDone', 'totalBooks', 'daysInactive', 'streak', 'activityPending'];
const NUM_FIELDS = new Set(['booksDone', 'totalBooks', 'daysInactive', 'streak']);

export function cleanProfile(input = {}, base = {}) {
  const out = { ...base };
  for (const k of PROFILE_FIELDS) {
    if (!(k in input)) continue;
    let v = input[k];
    if (NUM_FIELDS.has(k)) v = Math.max(0, Math.min(999, parseInt(v, 10) || 0));
    else if (k === 'activityPending') v = v === true || v === 'true';
    else v = String(v ?? '').slice(0, 80);
    out[k] = v;
  }
  return out;
}

// {teacher} {class} {theme} {book} {left} {days} {streak} {school}
export function fill(tpl, p = {}) {
  const left = Math.max(0, 3 - (p.booksDone | 0));
  const vars = {
    teacher: (p.teacher || 'Teacher').split(' ')[0],
    class: p.grade || 'your class',
    theme: p.theme || 'your theme',
    book: p.nextBook || 'the next story',
    left: left === 1 ? '1 story' : `${left || 3} stories`,
    days: String(p.daysInactive | 0),
    streak: String(p.streak | 0),
    school: p.school || 'your school',
  };
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

const newId = () => Date.now().toString(36) + randomBytes(4).toString('hex');
const ID_RE = /^[a-z0-9]{6,40}$/;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createApi({ store, adminKey = 'drp-demo', env = {} }) {
  async function getVapid() {
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
    let v = await store.get('config/vapid');
    if (!v) {
      v = webpush.generateVAPIDKeys();
      await store.set('config/vapid', v);
      v = (await store.get('config/vapid')) || v; // re-read: if two first requests raced, both settle on one
    }
    return v;
  }

  async function listDevices() {
    const keys = await store.list('devices/');
    const all = await Promise.all(keys.map((k) => store.get(k)));
    return all.filter(Boolean).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async function listEvents() {
    const keys = await store.list('events/');
    const map = {};
    for (const k of keys) {
      const [, msgId, deviceId, event] = k.split('/');
      (map[msgId] ||= { shown: new Set(), clicked: new Set() })[event]?.add(deviceId);
    }
    return map;
  }

  async function listMessages(limit = 40) {
    const keys = (await store.list('messages/')).sort().reverse().slice(0, limit);
    const [msgs, ev] = await Promise.all([Promise.all(keys.map((k) => store.get(k))), listEvents()]);
    return msgs.filter(Boolean).map((m) => {
      const e = ev[m.id] || { shown: new Set(), clicked: new Set() };
      const sent = m.results.filter((r) => r.ok).length;
      return {
        ...m,
        stats: { targeted: m.results.length, sent, failed: m.results.length - sent, shown: e.shown.size, clicked: e.clicked.size },
        results: m.results.map((r) => ({ ...r, shown: e.shown.has(r.deviceId), clicked: e.clicked.has(r.deviceId) })),
      };
    });
  }

  function pickTargets(devices, audience = {}) {
    if (audience.type === 'devices') {
      const ids = new Set(audience.deviceIds || []);
      const t = devices.filter((d) => ids.has(d.id));
      return { targets: t, label: t.length === 1 ? (t[0].profile?.teacher || 'One phone') + ' · ' + (t[0].ua?.label || 'phone') : `${t.length} selected phones` };
    }
    const seg = SEGMENTS.find((s) => s.id === (audience.segment || 'all')) || SEGMENTS[0];
    return { targets: devices.filter((d) => seg.test(d.profile || {})), label: seg.name };
  }

  async function sendMessage(req, input, source) {
    const devices = await listDevices();
    const { targets, label } = pickTargets(devices, input.audience);
    const vapid = await getVapid();
    const origin = new URL(req.url).origin;
    const subject = origin.startsWith('https://') ? origin : 'mailto:drp-demo@example.org';
    const msg = {
      id: newId(),
      createdAt: new Date().toISOString(),
      source,
      trigger: String(input.trigger || '').slice(0, 40),
      title: String(input.title || '').slice(0, 120),
      body: String(input.body || '').slice(0, 400),
      cta: String(input.cta || '').slice(0, 40),
      url: String(input.url || '/').slice(0, 300),
      audience: { label, count: targets.length },
      results: [],
    };
    msg.results = await Promise.all(
      targets.map(async (d) => {
        const p = d.profile || {};
        const u = new URL(msg.url, origin);
        u.searchParams.set('m', msg.id);
        const payload = JSON.stringify({
          title: fill(msg.title, p) || 'Digital Reading Programme',
          body: fill(msg.body, p),
          cta: fill(msg.cta, p),
          url: u.pathname + u.search,
          tag: msg.trigger || 'drp',
          messageId: msg.id,
          deviceId: d.id,
        });
        try {
          const r = await webpush.sendNotification(d.subscription, payload, {
            vapidDetails: { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
            TTL: 60 * 60 * 24,
            urgency: 'high', // wakes Android devices in Doze, so locked phones ring promptly
            timeout: 8000,
          });
          return { deviceId: d.id, teacher: p.teacher || '', device: d.ua?.label || '', ok: true, status: r.statusCode };
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) await store.del('devices/' + d.id); // subscription gone
          return { deviceId: d.id, teacher: p.teacher || '', device: d.ua?.label || '', ok: false, status: e.statusCode || 0, error: String(e.body || e.message || e).slice(0, 200) };
        }
      })
    );
    await store.set('messages/' + msg.id, msg);
    return msg;
  }

  return async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();
    let body = {};
    if (method !== 'GET' && method !== 'HEAD') {
      try { body = await req.json(); } catch { body = {}; }
    }
    const isAdmin = req.headers.get('x-admin-key') === adminKey;

    try {
      // ── Public: used by the teacher site and its service worker ──
      if (path === '/config' && method === 'GET') {
        const v = await getVapid();
        return json({ publicKey: v.publicKey });
      }

      if (path === '/subscribe' && method === 'POST') {
        const sub = body.subscription;
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !/^https:\/\//.test(sub.endpoint)) return json({ error: 'invalid subscription' }, 400);
        let id = ID_RE.test(body.deviceId || '') ? body.deviceId : null;
        let existing = id ? await store.get('devices/' + id) : null;
        if (!existing) {
          id = createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 16);
          existing = await store.get('devices/' + id);
        }
        const now = new Date().toISOString();
        const ua = body.ua || {};
        const device = {
          id,
          subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          profile: cleanProfile(body.profile || {}, existing?.profile || {}),
          ua: { label: String(ua.label || 'Phone').slice(0, 40), platform: String(ua.platform || '').slice(0, 20), browser: String(ua.browser || '').slice(0, 20), standalone: !!ua.standalone },
          createdAt: existing?.createdAt || now,
          lastSeen: now,
        };
        await store.set('devices/' + id, device);
        return json({ deviceId: id });
      }

      if (path === '/profile' && method === 'POST') {
        if (!ID_RE.test(body.deviceId || '')) return json({ error: 'deviceId required' }, 400);
        const d = await store.get('devices/' + body.deviceId);
        if (!d) return json({ error: 'unknown device' }, 404);
        d.profile = cleanProfile(body.profile || {}, d.profile || {});
        d.lastSeen = new Date().toISOString();
        await store.set('devices/' + d.id, d);
        return json({ ok: true });
      }

      if (path === '/unsubscribe' && method === 'POST') {
        if (ID_RE.test(body.deviceId || '')) await store.del('devices/' + body.deviceId);
        return json({ ok: true });
      }

      if (path === '/self-test' && method === 'POST') {
        if (!ID_RE.test(body.deviceId || '')) return json({ error: 'deviceId required' }, 400);
        const d = await store.get('devices/' + body.deviceId);
        if (!d) return json({ error: 'This phone is not registered. Turn reminders on again.' }, 404);
        if (d.lastSelfTest && Date.now() - Date.parse(d.lastSelfTest) < 15000) return json({ error: 'Please wait a few seconds between tests.' }, 429);
        d.lastSelfTest = new Date().toISOString();
        await store.set('devices/' + d.id, d);
        const delay = Math.max(0, Math.min(6, parseInt(body.delay, 10) || 0));
        if (delay) await sleep(delay * 1000); // stays inside the 10s function limit
        const msg = await sendMessage(req, {
          title: 'Reminders are working',
          body: 'Hi {teacher}, this is how a nudge from the reading programme will look on this phone.',
          cta: 'Open',
          url: '/?open=resume',
          trigger: 'self-test',
          audience: { type: 'devices', deviceIds: [d.id] },
        }, 'self-test');
        const r = msg.results[0];
        return json({ ok: !!r?.ok, error: r?.ok ? null : r?.error || 'not sent', messageId: msg.id });
      }

      if (path === '/track' && method === 'POST') {
        const { messageId, deviceId, event } = body;
        if (!ID_RE.test(messageId || '') || !ID_RE.test(deviceId || '') || !['shown', 'clicked'].includes(event)) return json({ error: 'bad event' }, 400);
        await store.set(`events/${messageId}/${deviceId}/${event}`, { at: new Date().toISOString() });
        return json({ ok: true });
      }

      // ── Admin: studio and console ──
      if (!isAdmin) return json({ error: 'Passcode required' }, 401);

      if (path === '/admin-check' && method === 'GET') return json({ ok: true, defaultPasscode: adminKey === 'drp-demo' });

      if (path === '/devices' && method === 'GET') {
        const devices = await listDevices();
        return json({ devices: devices.map(({ subscription, ...d }) => ({ ...d, endpointHost: new URL(subscription.endpoint).host })) });
      }

      const dm = path.match(/^\/devices\/([a-z0-9]+)$/);
      if (dm && method === 'PATCH') {
        const d = await store.get('devices/' + dm[1]);
        if (!d) return json({ error: 'unknown device' }, 404);
        d.profile = cleanProfile(body.profile || {}, d.profile || {});
        await store.set('devices/' + d.id, d);
        return json({ ok: true, profile: d.profile });
      }
      if (dm && method === 'DELETE') {
        await store.del('devices/' + dm[1]);
        return json({ ok: true });
      }

      if (path === '/segments' && method === 'GET') {
        const devices = await listDevices();
        return json({ segments: SEGMENTS.map((s) => ({ id: s.id, name: s.name, rule: s.rule, count: devices.filter((d) => s.test(d.profile || {})).length })) });
      }

      if (path === '/send' && method === 'POST') {
        if (!body.title && !body.body) return json({ error: 'title or body required' }, 400);
        const msg = await sendMessage(req, body, body.source === 'console' ? 'console' : body.source === 'api' ? 'api' : 'studio');
        return json({ message: { ...msg, stats: { targeted: msg.results.length, sent: msg.results.filter((r) => r.ok).length } } });
      }

      if (path === '/messages' && method === 'GET') return json({ messages: await listMessages(parseInt(url.searchParams.get('limit'), 10) || 40) });

      if (path === '/overview' && method === 'GET') {
        const [devices, messages] = await Promise.all([listDevices(), listMessages(200)]);
        const t = messages.reduce((a, m) => ({ sent: a.sent + m.stats.sent, shown: a.shown + m.stats.shown, clicked: a.clicked + m.stats.clicked }), { sent: 0, shown: 0, clicked: 0 });
        return json({ subscribers: devices.length, messages: messages.length, ...t });
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: String(e.message || e) }, 500);
    }
  };
}
