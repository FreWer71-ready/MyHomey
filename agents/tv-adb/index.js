// TV-agent: läser Google TV via ADB över nätverket och skickar "Now Playing" till dashboarden.
// Kör lokalt (t.ex. Raspberry Pi) i samma nät som TV:n: `npm start` (läser .env).
// Skickar till Supabase edge-funktionen tv-ingest med en hemlighet som bara kan skriva TV-status.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildState } from './parse.js';
import { frameState, frameToStatus } from './frame.js';

const run = promisify(execFile);
const env = (k, d) => process.env[k] ?? d;
const CFG = {
  host: env('TV_HOST'),
  port: Number(env('TV_PORT', '5555')),
  adb: env('ADB_PATH', 'adb'),
  url: env('INGEST_URL'),
  secret: env('TV_SECRET'),
  household: env('HOUSEHOLD', 'fredrik'),
  device: env('DEVICE_ID', 'google-tv-vardagsrum'),
  pollMs: Number(env('POLL_MS', '10000')),
  heartbeatMs: Number(env('HEARTBEAT_MS', '60000')),
  // Samsung The Frame (valfritt): IP i hemnätet. Skickas som en egen enhet.
  frame: env('FRAME_HOST'),
  frameDevice: env('FRAME_DEVICE_ID', 'the-frame'),
  frameMs: Number(env('FRAME_POLL_MS', '20000')),
};
for (const k of ['host', 'url', 'secret']) {
  if (!CFG[k]) { console.error(`Saknar ${k === 'host' ? 'TV_HOST' : k === 'url' ? 'INGEST_URL' : 'TV_SECRET'} i .env`); process.exit(1); }
}
const serial = `${CFG.host}:${CFG.port}`;
const log = (...a) => console.log(new Date().toISOString(), ...a);

let connected = false;
let backoff = 5_000;
/** Senast skickat per enhet (skicka bara vid ändring, plus hjärtslag). */
const last = new Map();
let stopping = false;

async function adb(args, timeout = 8_000) {
  const { stdout } = await run(CFG.adb, args, { timeout, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}
const shell = (...cmd) => adb(['-s', serial, 'shell', ...cmd]);

/** Anslut (eller återanslut). Första gången måste "Tillåt alltid" godkännas på TV:n. */
async function connect() {
  try {
    const out = await adb(['connect', serial], 10_000);
    if (/connected to|already connected/i.test(out)) {
      const state = (await adb(['-s', serial, 'get-state'], 5_000)).trim();
      if (state === 'device') {
        if (!connected) log(`Ansluten till ${serial}`);
        connected = true; backoff = 5_000;
        return true;
      }
      log(state === 'unauthorized'
        ? 'ADB väntar på godkännande: välj "Tillåt alltid från den här datorn" på TV:n.'
        : `ADB-status: ${state}`);
    } else {
      log(`Kunde inte ansluta: ${out.trim()}`);
    }
  } catch (e) {
    log(`Anslutningsfel: ${(e.stderr || e.message || '').toString().trim().split('\n')[0]}`);
  }
  connected = false;
  return false;
}

/** Skicka bara vid ändring, plus ett hjärtslag så att dashboarden ser att agenten lever. */
async function send(state, device = CFG.device) {
  const json = JSON.stringify(state);
  const prev = last.get(device) ?? { json: '', at: 0 };
  if (json === prev.json && Date.now() - prev.at < CFG.heartbeatMs) return;
  try {
    const res = await fetch(CFG.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tv-secret': CFG.secret },
      body: JSON.stringify({ ...state, household: CFG.household, device_id: device }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { log(`Dashboarden svarade ${res.status}: ${(await res.text()).slice(0, 200)}`); return; }
    if (json !== prev.json) log(`Ny status (${device}):`, state.is_on ? `${state.app_name ?? '–'} · ${state.media_title ?? 'ingen titel'} (${state.media_status})` : state.app_name ?? 'av/viloläge');
    last.set(device, { json, at: Date.now() });
  } catch (e) {
    log(`Kunde inte skicka: ${e.name}`);
  }
}

async function poll() {
  if (!connected && !(await connect())) {
    // Nåbar inte alls (avstängd, utan nät): rapportera "av" en gång och vänta längre.
    await send({ is_on: false, current_app: null, app_name: null, media_title: null, media_artist: null, media_status: 'none' });
    backoff = Math.min(backoff * 2, 60_000);
    return backoff;
  }
  try {
    const [power, window, media, audio] = await Promise.all([
      shell('dumpsys', 'power'),
      // Båda källorna: Android-versionerna skriver förgrundsappen på olika ställen.
      Promise.all([
        shell('dumpsys', 'activity', 'activities').catch(() => ''),
        shell('dumpsys', 'window').catch(() => ''),
      ]).then((o) => o.join('\n')),
      shell('dumpsys', 'media_session'),
      // Spelare som faktiskt spelar ljud (rättar appar som rapporterar fel mediastatus).
      shell('dumpsys', 'audio').catch(() => ''),
    ]);
    await send(buildState({ power, window, media, audio }));
    return CFG.pollMs;
  } catch (e) {
    log(`ADB-kommandot misslyckades (${(e.stderr || e.message || '').toString().trim().split('\n')[0]}), återansluter.`);
    connected = false;
    return 2_000;
  }
}

async function loop() {
  while (!stopping) {
    const wait = await poll();
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** The Frame: egen loop, oberoende av ADB mot Google TV. */
async function frameLoop() {
  while (!stopping && CFG.frame) {
    const f = await frameState(CFG.frame, { log }).catch(() => null);
    if (f) await send(frameToStatus(f), CFG.frameDevice);
    await new Promise((r) => setTimeout(r, CFG.frameMs));
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    stopping = true;
    log('Avslutar.');
    await adb(['disconnect', serial], 3_000).catch(() => {});
    process.exit(0);
  });
}

log(`TV-agent startar: ${serial}, var ${CFG.pollMs / 1000} s, hushåll ${CFG.household}`);
if (CFG.frame) log(`The Frame: ${CFG.frame} var ${CFG.frameMs / 1000} s`);
loop();
frameLoop();
