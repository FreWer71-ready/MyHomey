// Homey Dashboard POC – skickar alla enheters värden till Supabase.
// Körs av ett flöde: NÄR "Var 1 minut" → DÅ HomeyScript "Kör homey-ingest".
// Fyll i URL och SECRET här på Homey. Spara aldrig hemligheten i git.

const URL = 'https://swqaqtcjimyoxcyejrrd.supabase.co/functions/v1/homey-ingest';
const SECRET = 'KLISTRA_IN_HEMLIGHETEN';

const iso = (t) => (t ? new Date(t).toISOString() : null);

const [zones, devices, moods] = await Promise.all([
  Homey.zones.getZones(),
  Homey.devices.getDevices(),
  // Moods finns inte på alla Homey-modeller/versioner.
  Homey.moods ? Homey.moods.getMoods().catch(() => null) : null,
]);
// Favoritmarkerade moods i Homey-appen (om användar-API:t finns).
const me = Homey.users ? await Homey.users.getUserMe().catch(() => null) : null;
const favorites = new Set(me?.properties?.favoriteMoods ?? []);

// Favoritflows: hämta bara namnen på de som är favoriter (vanliga eller avancerade).
const flows = [];
for (const id of me?.properties?.favoriteFlows ?? []) {
  const basic = await Homey.flow.getFlow({ id }).catch(() => null);
  const adv = basic ? null : await Homey.flow.getAdvancedFlow({ id }).catch(() => null);
  const f = basic || adv;
  if (f) flows.push({ id, name: f.name, advanced: !basic });
}

// Homey Energy: uppskattad effekt (W) per enhet, även för lampor utan mätare.
// Rapporten är per zon (enheter direkt i zonen + summor för underzoner), så vi frågar varje zon.
// Skickas som capability measure_power.homey för enheter som saknar egen measure_power.
const est = {};
let energyOk = false;
if (Homey.energy && Homey.energy.getLiveReport) {
  const reports = await Promise.all(Object.keys(zones).map((zone) =>
    Homey.energy.getLiveReport({ zone }).catch(() => null)));
  for (const r of reports) {
    if (!r) continue;
    energyOk = true;
    for (const it of r.items || []) {
      if (it.type === 'device' && typeof it.values?.W === 'number') est[it.id] = it.values.W;
    }
  }
}
// Ny tidsstämpel bara när värdet ändrats, så historiken inte fylls av upprepningar.
const now = new Date().toISOString();
const prev = (typeof global !== 'undefined' && global.get && global.get('estPower')) || {};
const estT = {};
for (const [id, w] of Object.entries(est)) {
  const r = Math.round(w * 10) / 10;
  estT[id] = prev[id] && prev[id].w === r ? prev[id].t : now;
  est[id] = r;
}
if (typeof global !== 'undefined' && global.set) {
  global.set('estPower', Object.fromEntries(Object.entries(est).map(([id, w]) => [id, { w, t: estT[id] }])));
}

// Dörrar/fönster: Homey Insights sparar varje ändring. Skicka senaste timmens händelser,
// så att även öppningar kortare än en minut (mellan körningarna) kommer med. Dubbletter tas bort i databasen.
const EVENT_CAPS = ['alarm_contact'];
const events = [];
if (Homey.insights && Homey.insights.getLogEntries) {
  const g = typeof global !== 'undefined' && global.get ? global : null;
  let logs = g && g.get('contactLogs');
  if (!logs || Date.now() - logs.at > 3600_000) {
    const all = await Homey.insights.getLogs().catch(() => ({}));
    logs = {
      at: Date.now(),
      list: Object.values(all || {})
        .filter((l) => (l.ownerUri || '').startsWith('homey:device:') && EVENT_CAPS.some((c) => (l.id || '').endsWith(c)))
        .map((l) => ({ id: l.id, uri: l.ownerUri, cap: EVENT_CAPS.find((c) => l.id.endsWith(c)) })),
    };
    if (g) g.set('contactLogs', logs);
  }
  for (const l of logs.list) {
    const r = await Homey.insights.getLogEntries({ id: l.id, resolution: 'lastHour' })
      .catch(() => Homey.insights.getLogEntries({ uri: l.uri, id: l.cap, resolution: 'lastHour' }).catch(() => null));
    for (const e of (r && r.values) || []) {
      if (e && e.t && (typeof e.v === 'boolean' || typeof e.v === 'number')) {
        events.push({ device: l.uri.split(':').pop(), cap: l.cap, t: iso(e.t), v: e.v });
      }
    }
  }
}

const payload = {
  events,
  v: 1,
  source: 'homeyscript',
  sent_at: new Date().toISOString(),
  zones: Object.values(zones).map((z) => ({ id: z.id, name: z.name, parent: z.parent || null })),
  ...(moods && {
    moods: Object.values(moods).map((m) => ({ id: m.id, name: m.name, zone: m.zone || null, favorite: favorites.has(m.id) })),
  }),
  ...(me && { flows }),
  devices: Object.values(devices).map((d) => ({
    id: d.id,
    name: d.name,
    zone: d.zone || null,
    class: d.virtualClass || d.class || null, // "Vad är anslutet?" i Homey (t.ex. uttag med lampa) går före
    driver: d.driverId || d.driverUri || null,
    available: d.available !== false,
    caps: [
      ...Object.values(d.capabilitiesObj || {}).map((c) => ({
        id: c.id,
        v: c.value === undefined ? null : c.value,
        u: c.units || null,
        s: !!c.setable,
        t: iso(c.lastUpdated),
      })),
      ...(est[d.id] !== undefined && !(d.capabilitiesObj || {}).measure_power
        ? [{ id: 'measure_power.homey', v: est[d.id], u: 'W', s: false, t: estT[d.id] }]
        : []),
    ],
  })),
};

const res = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-homey-secret': SECRET },
  body: JSON.stringify(payload),
});
const text = await res.text();
if (!res.ok) throw new Error(`Ingest ${res.status}: ${text}`);

log(`Energi: ${energyOk ? `${Object.keys(est).length} enheter, ${Math.round(Object.values(est).reduce((a, b) => a + b, 0))} W` : 'ingen energirapport'}`);
log(`Dörr/fönster-händelser: ${events.length}`);
log(`${payload.devices.length} enheter, ${moods ? Object.keys(moods).length : 'inga'} moods (${favorites.size} favoriter), ${flows.length} favoritflows → ${text}`);
return true;
