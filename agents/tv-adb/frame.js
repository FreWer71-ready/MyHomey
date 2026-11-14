// Samsung The Frame (Tizen) lokalt i hemnätet: ström, konstläge och app som körs.
// - Ström: REST http://<ip>:8001/api/v2/ (PowerState), inget godkännande.
// - Konstläge: WebSocket wss://<ip>:8002 kanal com.samsung.art-app. Första gången visar TV:n en ruta
//   ("Tillåt"); token sparas i .frame-token. Kräver paketet `ws` (npm install), annars hoppas konstläget över.
// - Appar: listan över installerade appar hämtas via fjärrkontrollkanalen (samma token), sedan kollas
//   REST /api/v2/applications/<id> (visible=true). Utan lista används några vanliga Tizen-appar.
import { readFile, writeFile } from 'node:fs/promises';

/** Vanliga Tizen-appar (app-id -> namn). */
export const TIZEN_APPS = {
  '3201907018807': 'Netflix',
  '111299001912': 'YouTube',
  '3201901017640': 'Disney+',
  '3201910019365': 'Prime Video',
  '3201807016597': 'Apple TV',
  '3201606009684': 'Spotify',
  '3202301029760': 'HBO Max',
};

/** PowerState ur /api/v2/: "on" eller "standby". Saknas fältet men TV:n svarar räknas den som på. */
export function parseDeviceInfo(json) {
  const d = json?.device ?? {};
  const state = String(d.PowerState ?? 'on').toLowerCase();
  return { power: state === 'on' ? 'on' : 'standby', model: d.modelName ?? d.ModelName ?? null, name: d.name ?? null };
}

/** Svar från art-kanalen: {event:"d2d_service_message", data:"{\"event\":\"artmode_status\",\"value\":\"on\"}"}. */
export function parseArtMessage(raw) {
  try {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (msg?.event === 'ms.channel.connect') return { token: msg.data?.token ?? null };
    if (msg?.event !== 'd2d_service_message') return null;
    const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
    if (data?.event === 'artmode_status' || data?.event === 'art_mode_changed') return { artMode: data.value === 'on' || data.status === 'on' };
    if (data?.event === 'error') return { error: data.error_code ?? 'fel' };
  } catch { /* ogiltigt svar */ }
  return null;
}

const get = async (url, ms = 3000) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** Ett WebSocket-anrop mot en kanal på TV:n: skickar `request` när kanalen är redo och väntar på svar som `pick` godtar. */
async function channelCall(host, channel, tokenFile, request, pick, log, ms = 6000) {
  let WebSocket;
  try { ({ default: WebSocket } = await import('ws')); } catch { return null; } // paketet saknas
  const token = (await readFile(tokenFile, 'utf8').catch(() => '')).trim();
  const name = Buffer.from('MyHomey TV-agent').toString('base64');
  const url = `wss://${host}:8002/api/v2/channels/${channel}?name=${name}${token ? `&token=${token}` : ''}`;
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout: 4000 });
    const done = (v) => { clearTimeout(t); try { ws.close(); } catch { /* stängd */ } resolve(v); };
    const t = setTimeout(() => done(null), ms);
    ws.on('message', async (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.event === 'ms.channel.connect') {
        const tok = msg.data?.token;
        if (tok && tok !== token) { await writeFile(tokenFile, tok).catch(() => {}); log?.('The Frame: godkänd, token sparad.'); }
        ws.send(JSON.stringify(request));
        return;
      }
      const v = pick(msg);
      if (v !== undefined) done(v);
    });
    ws.on('error', () => done(null));
    ws.on('close', () => done(null));
  });
}

let appCache = { at: 0, apps: null };
/** Installerade appar ([{ id, name }]), cachas en timme. */
async function installedApps(host, tokenFile, log) {
  if (appCache.apps && Date.now() - appCache.at < 3600_000) return appCache.apps;
  const list = await channelCall(host, 'samsung.remote.control', tokenFile,
    { method: 'ms.channel.emit', params: { event: 'ed.installedApp.get', to: 'host', data: '' } },
    (m) => (m.event === 'ed.installedApp.get' ? (m.data?.data ?? []) : undefined), log);
  if (Array.isArray(list) && list.length) {
    // Installerade appar plus reservlistan (om någon app saknas i TV:ns lista).
    const apps = list.filter((a) => a.appId && a.name).map((a) => ({ id: String(a.appId), name: String(a.name) }));
    for (const [id, name] of Object.entries(TIZEN_APPS)) if (!apps.some((a) => a.id === id)) apps.push({ id, name });
    appCache = { at: Date.now(), apps };
    log?.(`The Frame: ${apps.length} appar att bevaka.`);
  } else {
    // Ingen lista: försök igen om 10 min, använd reservlistan så länge.
    appCache = { at: Date.now() - 3000_000, apps: null };
    log?.('The Frame: fick ingen applista från TV:n, använder reservlistan.');
  }
  return appCache.apps;
}

async function artMode(host, tokenFile, log) {
  let WebSocket;
  try { ({ default: WebSocket } = await import('ws')); } catch { return null; } // paketet saknas
  const token = await readFile(tokenFile, 'utf8').catch(() => '');
  const name = Buffer.from('MyHomey TV-agent').toString('base64');
  const url = `wss://${host}:8002/api/v2/channels/com.samsung.art-app?name=${name}${token ? `&token=${token.trim()}` : ''}`;
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout: 4000 }); // TV:n har självsignerat certifikat
    const done = (v) => { clearTimeout(t); try { ws.close(); } catch { /* stängd */ } resolve(v); };
    const t = setTimeout(() => done(null), 6000);
    ws.on('message', async (raw) => {
      const r = parseArtMessage(raw.toString());
      if (!r) return;
      if ('token' in r) {
        if (r.token && r.token !== token.trim()) { await writeFile(tokenFile, r.token).catch(() => {}); log?.('The Frame: godkänd, token sparad.'); }
        ws.send(JSON.stringify({ method: 'ms.channel.emit', params: { event: 'art_app_request', to: 'host',
          data: JSON.stringify({ request: 'get_artmode_status', id: crypto.randomUUID() }) } }));
      } else if ('artMode' in r) done(r.artMode);
      else if ('error' in r) done(null);
    });
    ws.on('error', () => done(null));
    ws.on('close', () => done(null));
  });
}

/** Samlat läge för The Frame. Nås den inte alls räknas den som avstängd. */
export async function frameState(host, { tokenFile = '.frame-token', log } = {}) {
  let info;
  try { info = parseDeviceInfo(await get(`http://${host}:8001/api/v2/`)); }
  catch { return { reachable: false, power: 'off', artMode: null, app: null }; }
  if (info.power !== 'on') return { reachable: true, power: 'standby', artMode: null, app: null };
  const [art, app] = await Promise.all([
    artMode(host, tokenFile, log).catch(() => null),
    (async () => {
      // Alla installerade appar (eller reservlistan) kollas parallellt; den som syns är den som körs.
      const apps = (await installedApps(host, tokenFile, log).catch(() => null)) ?? Object.entries(TIZEN_APPS).map(([id, name]) => ({ id, name }));
      const hits = await Promise.all(apps.slice(0, 60).map(async (a) => {
        const r = await get(`http://${host}:8001/api/v2/applications/${a.id}`, 2000).catch(() => null);
        return r?.visible ? a.name : null;
      }));
      return hits.find(Boolean) ?? null;
    })(),
  ]);
  return { reachable: true, power: 'on', artMode: art, app };
}

/** Till dashboardens format (en egen rad i tv_status). */
export function frameToStatus(f) {
  const on = f.power === 'on';
  return {
    is_on: on && f.artMode !== true,
    current_app: on ? (f.artMode ? 'art-mode' : f.app ? `tizen:${f.app}` : null) : null,
    app_name: on ? (f.artMode ? 'Konstläge' : f.app ?? 'Samsung TV') : null,
    media_title: null, media_artist: null,
    media_status: on && !f.artMode && f.app ? 'playing' : 'none',
  };
}
