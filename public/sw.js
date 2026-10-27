// Service worker for the teacher site: receives push (even with the
// site closed and the phone locked), shows the notification, reports
// "shown" and "clicked", and opens the exact screen the nudge is about.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function track(d, event) {
  if (!d || !d.messageId || !d.deviceId) return Promise.resolve();
  return fetch('/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messageId: d.messageId, deviceId: d.deviceId, event }),
  }).catch(() => {});
}

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Digital Reading Programme';
  const options = {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || 'drp',
    renotify: true,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: { url: d.url || '/', messageId: d.messageId, deviceId: d.deviceId },
  };
  if (d.cta) options.actions = [{ action: 'open', title: d.cta }];
  // A visible notification is shown for every push (required on iPhone).
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), track(d, 'shown')]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const target = new URL(d.url || '/', self.location.origin).href;
  const open = (async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = wins.find((w) => {
      const p = new URL(w.url).pathname;
      return !p.startsWith('/studio') && !p.startsWith('/push');
    });
    if (app) {
      try {
        const nav = 'navigate' in app ? await app.navigate(target) : null;
        return (nav || app).focus();
      } catch (e) { /* fall through to a new window */ }
    }
    return self.clients.openWindow(target);
  })();
  event.waitUntil(Promise.all([open, track(d, 'clicked')]));
});

// If the browser rotates the subscription, register the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const { publicKey } = await (await fetch('/api/config')).json();
    const pad = '='.repeat((4 - (publicKey.length % 4)) % 4);
    const raw = atob((publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), ua: { label: 'Phone (renewed)' } }),
    });
  })());
});
