// Netlify Function: serves every /api/* route from lib/core.mjs,
// storing data in Netlify Blobs (no setup needed on Netlify).
import { getStore } from '@netlify/blobs';
import { createApi } from '../../lib/core.mjs';

export default async (req) => {
  const blobs = getStore({ name: 'drp-push', consistency: 'strong' });
  const store = {
    get: (k) => blobs.get(k, { type: 'json' }),
    set: (k, v) => blobs.setJSON(k, v),
    del: (k) => blobs.delete(k),
    list: async (prefix) => (await blobs.list({ prefix })).blobs.map((b) => b.key),
  };
  const api = createApi({
    store,
    adminKey: process.env.ADMIN_PASSCODE || 'drp-demo',
    env: { VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY },
  });
  return api(req);
};

export const config = { path: '/api/*' };
