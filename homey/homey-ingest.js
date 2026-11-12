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
// Skickas som capability measure_power.homey för enheter som saknar egen measure_power.
const live = Homey.energy && Homey.energy.getLiveReport ? await Homey.energy.getLiveReport().catch(() => null) : null;
const est = {};
const items = Array.isArray(live?.items) ? live.items : Object.values(live?.items ?? {});
for (const it of items) {
  const id = it.id || it.deviceId;
  const w = it.values?.W ?? it.W ?? it.value;
  if (id && typeof w === 'number' && (it.type === undefined || it.type === 'device')) est[id] = w;
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

const payload = {
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
    class: d.class || null,
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

log(`Energi: ${live ? `${Object.keys(est).length} enheter med uppskattning (nycklar: ${Object.keys(live).join(',')})` : 'ingen energirapport'}`);
log(`${payload.devices.length} enheter, ${moods ? Object.keys(moods).length : 'inga'} moods (${favorites.size} favoriter), ${flows.length} favoritflows → ${text}`);
return true;
