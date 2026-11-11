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

const payload = {
  v: 1,
  source: 'homeyscript',
  sent_at: new Date().toISOString(),
  zones: Object.values(zones).map((z) => ({ id: z.id, name: z.name, parent: z.parent || null })),
  ...(moods && {
    moods: Object.values(moods).map((m) => ({ id: m.id, name: m.name, zone: m.zone || null })),
  }),
  devices: Object.values(devices).map((d) => ({
    id: d.id,
    name: d.name,
    zone: d.zone || null,
    class: d.class || null,
    driver: d.driverId || d.driverUri || null,
    available: d.available !== false,
    caps: Object.values(d.capabilitiesObj || {}).map((c) => ({
      id: c.id,
      v: c.value === undefined ? null : c.value,
      u: c.units || null,
      s: !!c.setable,
      t: iso(c.lastUpdated),
    })),
  })),
};

const res = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-homey-secret': SECRET },
  body: JSON.stringify(payload),
});
const text = await res.text();
if (!res.ok) throw new Error(`Ingest ${res.status}: ${text}`);

log(`${payload.devices.length} enheter, ${moods ? Object.keys(moods).length : 'inga'} moods → ${text}`);
return true;
