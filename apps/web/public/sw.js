// Minimal service worker: gör dashboarden installerbar som app och visar en lugn sida
// i stället för webbläsarens felsida när nätet tillfälligt saknas. Inget cachas (alltid färsk data).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const OFFLINE = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ingen anslutning</title><meta http-equiv="refresh" content="20"></head>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0B0F14;color:#E6EDF3;font:600 22px system-ui,sans-serif;text-align:center">
<div>Ingen anslutning just nu<div style="margin-top:8px;font-weight:400;font-size:17px;color:#8B98A5">Försöker igen automatiskt …</div></div></body></html>`;

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});
