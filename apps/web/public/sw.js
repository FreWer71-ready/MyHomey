// Sparad sida: den senast laddade sidan lagras på enheten och visas direkt vid nästa öppning, medan uppdaterad info hämtas
// (SparadSida.tsx hämtar om sidan på plats och markerar "Laddar"). Bara HTML-sidor och hashade filer under appens adress;
// aldrig API, inloggning eller andra anrop.
// Nödbroms: ersätt filen med en som avregistrerar sig (self.registration.unregister() vid activate); webbläsaren byter vid nästa sidöppning.
const PAGES = 'sidor-v1';
const FILES = 'filer-v1';
const MAX_PAGES = 12;
const MAX_FILES = 300;
const MAX_AGE_MS = 12 * 3600_000;
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, ''); // t.ex. "/mydashboard"
// Läggs in i sparade sidor: SparadSida.tsx ser flaggan och hämtar om sidan. Kommer sidan inte igång (t.ex. filer som saknas efter
// en ny version) rensas sparade sidor och sidan laddas om från nätet.
const MARK = '<script>window.__SIDA_SPARAD=1;setTimeout(function(){if(!window.__SIDA_LEVANDE){var r=function(){location.reload()};try{caches.delete("' + PAGES + '").then(r,r)}catch(e){r()}}},10000)</script>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== PAGES && k !== FILES) await caches.delete(k);
  await self.clients.claim();
})()));

const isPage = (url) => url.pathname.startsWith(BASE) && !/^\/(api|auth|login)(\/|$)/.test(url.pathname.slice(BASE.length) || '/');
const keyOf = (url) => url.origin + url.pathname + url.search;
const isHtml = (res) => res.ok && !res.redirected && res.type !== 'opaqueredirect' && /text\/html/.test(res.headers.get('content-type') || '');

async function trim(cache, max) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

async function store(cache, key, res) {
  const body = await res.arrayBuffer();
  await cache.put(key, new Response(body, { status: 200, headers: { 'content-type': res.headers.get('content-type') || 'text/html; charset=utf-8', 'x-sparad': String(Date.now()) } }));
  await trim(cache, MAX_PAGES);
}

const stale = async (hit) => new Response((await hit.text()).replace('</head>', MARK + '</head>'), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(BASE + '/_next/static/')) e.respondWith(file(e, req));
  else if (req.mode === 'navigate' && isPage(url)) e.respondWith(page(e, req, url));
});

// Hashade filer ändras aldrig: sparade filer först, så att en sparad sida hittar sina filer även efter en ny version.
async function file(e, req) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) e.waitUntil(cache.put(req, res.clone()).then(() => trim(cache, MAX_FILES)));
  return res;
}

// Sparad sida direkt (högst 12 h gammal); annars nätet, och en kopia sparas. Utan nät visas även en äldre sparad sida.
async function page(e, req, url) {
  const key = keyOf(url);
  const cache = await caches.open(PAGES);
  const hit = await cache.match(key);
  const age = hit ? Date.now() - Number(hit.headers.get('x-sparad') || 0) : Infinity;
  if (hit && age < MAX_AGE_MS) return stale(hit);
  try {
    const res = await fetch(req);
    if (isHtml(res)) e.waitUntil(store(cache, key, res.clone()));
    return res;
  } catch (err) {
    if (hit) return stale(hit);
    throw err;
  }
}

// Sidan ber om att få sin senaste version sparad (efter uppdatering, eller när en sida inte sparats nyligen).
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'spara' && typeof d.url === 'string') e.waitUntil(save(d));
});

async function save(d) {
  const url = new URL(d.url, self.location.origin);
  if (url.origin !== self.location.origin || !isPage(url)) return;
  const key = keyOf(url);
  const cache = await caches.open(PAGES);
  const hit = await cache.match(key);
  const age = hit ? Date.now() - Number(hit.headers.get('x-sparad') || 0) : Infinity;
  if (age < (typeof d.maxAgeS === 'number' ? d.maxAgeS : 600) * 1000) return;
  try {
    const res = await fetch(url.href, { credentials: 'same-origin', headers: { accept: 'text/html' }, redirect: 'manual' });
    if (isHtml(res)) await store(cache, key, res);
  } catch { /* behåller den sparade sidan */ }
}
