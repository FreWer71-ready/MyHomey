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
  // Mys = solnedgång: färglampor turas om mellan orange, bärnsten och rosaorange,
  // vita lampor går på varmaste varmvitt.
  mys: {
    on: true, dim: 0.35, temp: 1.0,
    colors: [
      { hue: 0.07, sat: 0.9, dim: 0.35 }, // orange
      { hue: 0.11, sat: 0.65, dim: 0.4 }, // bärnsten
      { hue: 0.03, sat: 0.75, dim: 0.3 }, // rosaorange
    ],
  },
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

const has = (d, id) => d.capabilities.includes(id);
let n = 0; // räknare för färglampor, så färgerna sprids i rummet

const results = await Promise.allSettled(lights.map(async (d) => {
  if (!s.on) return set(d, 'onoff', false);
  const color = s.colors && has(d, 'light_hue') && has(d, 'light_saturation') ? s.colors[n++ % s.colors.length] : null;
  if (color) {
    await set(d, 'light_mode', 'color');
    await set(d, 'light_hue', color.hue);
    await set(d, 'light_saturation', color.sat);
    await set(d, 'dim', color.dim);
  } else {
    await set(d, 'light_mode', 'temperature');
    await set(d, 'light_temperature', s.temp);
    await set(d, 'dim', s.dim);
  }
  return set(d, 'onoff', true);
}));

const failed = results.filter((r) => r.status === 'rejected').length;
log(`${a.scene}: ${lights.length - failed}/${lights.length} lampor`);
return failed === 0;
