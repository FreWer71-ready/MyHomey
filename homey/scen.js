// DB Scen: Ljust / Mys / Släck för ett rum, eller aktivera ett mood.
// Flöde: NÄR Logik → "Webhook tas emot", händelse: scen
//        DÅ 1) HomeyScript → "Kör med argument": DB Scen, argument = [Tag]
//           2) HomeyScript → "Kör": Dashboard (fördröjning 2 s)
// Argument (JSON från dashboarden):
//   {"zone":"<zon-id>","scene":"ljust|mys|slack"}  eller  {"mood":"<mood-id>"}

const a = JSON.parse(args[0] || '{}');

if (a.mood) {
  const moods = Homey.moods;
  const activate = moods && (moods.setMood || moods.activateMood || moods.applyMood);
  if (!activate) {
    throw new Error('Kan inte aktivera moods. Tillgängligt: ' + Object.keys(Object.getPrototypeOf(moods || {})).join(', '));
  }
  await activate.call(moods, { id: a.mood });
  log(`mood ${a.mood} aktiverat`);
  return true;
}

const SCENES = {
  ljust: { on: true, dim: 1.0, temp: 0.3 }, // light_temperature: 0 = kallt, 1 = varmt
  mys: { on: true, dim: 0.3, temp: 0.9 },
  slack: { on: false },
};
const s = SCENES[a.scene];
if (!a.zone || !s) throw new Error(`Ogiltigt argument: ${args[0]}`);

const lights = Object.values(await Homey.devices.getDevices())
  .filter((d) => d.zone === a.zone && d.class === 'light' && d.available !== false);

const set = (d, capabilityId, value) =>
  d.capabilities.includes(capabilityId)
    ? Homey.devices.setCapabilityValue({ deviceId: d.id, capabilityId, value })
    : null;

const results = await Promise.allSettled(lights.map(async (d) => {
  if (!s.on) return set(d, 'onoff', false);
  await set(d, 'dim', s.dim);
  await set(d, 'light_temperature', s.temp);
  return set(d, 'onoff', true);
}));

const failed = results.filter((r) => r.status === 'rejected').length;
log(`${a.scene}: ${lights.length - failed}/${lights.length} lampor`);
return failed === 0;
