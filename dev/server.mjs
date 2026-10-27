// Local test server (not used on Netlify): static files + /api with a file store.
// Run: npm run dev   → http://localhost:8888
import http from 'node:http';
import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from '../lib/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const dataDir = process.env.DATA_DIR || path.join(root, '.data');
const enc = (k) => encodeURIComponent(k);

const store = {
  async get(k) { try { return JSON.parse(await readFile(path.join(dataDir, enc(k)), 'utf8')); } catch { return null; } },
  async set(k, v) { await mkdir(dataDir, { recursive: true }); await writeFile(path.join(dataDir, enc(k)), JSON.stringify(v)); },
  async del(k) { try { await unlink(path.join(dataDir, enc(k))); } catch {} },
  async list(prefix) { if (!existsSync(dataDir)) return []; return (await readdir(dataDir)).map(decodeURIComponent).filter((k) => k.startsWith(prefix)); },
};
const api = createApi({ store, adminKey: process.env.ADMIN_PASSCODE || 'drp-demo' });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await api(new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = path.join(pub, decodeURIComponent(url.pathname));
  if (!p.startsWith(pub)) { res.writeHead(403); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  else if (!path.extname(p) && existsSync(p + '/index.html')) { res.writeHead(301, { location: url.pathname + '/' }); return res.end(); }
  try { const b = await readFile(p); res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(b); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(process.env.PORT || 8888, () => console.log('DRP push demo on http://localhost:' + (process.env.PORT || 8888)));
