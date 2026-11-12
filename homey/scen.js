// DB Scen: Ljust / Mys / Släck för ett rum, eller aktivera ett mood.
// Flöde: NÄR Logik → "Webhook tas emot", händelse: scen
//        DÅ 1) HomeyScript → "Kör med argument": DB Scen, argument = [Tag]
//           2) HomeyScript → "Kör": Dashboard (fördröjning 2 s)
// Argument (JSON från dashboarden):
//   {"zone":"<zon-id>","scene":"ljust|mys|slack"}  eller  {"mood":"<mood-id>"}
//   {"flow":"<flow-id>","advanced":"true|false"}
//   {"device":"<enhets-id>","on":"true|false","dim":"0–1","temp":"0–1","hue":"0–1","sat":"0–1"} (alla valfria utom device)

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

if (a.flow) {
  // Startar flödet (kräver kortet "Detta flöde startas" i vanliga flöden).
  if (a.advanced === 'true' || a.advanced === true) await Homey.flow.triggerAdvancedFlow({ id: a.flow });
  else await Homey.flow.triggerFlow({ id: a.flow });
  log(`flow ${a.flow} startat`);
  return true;
}

if (a.device) {
  const d = await Homey.devices.getDevice({ id: a.device });
  const has = (id) => d.capabilities.includes(id);
  const set = (capabilityId, value) => Homey.devices.setCapabilityValue({ deviceId: d.id, capabilityId, value });
  const num = (k) => (a[k] === undefined ? null : Math.min(1, Math.max(0, Number(a[k]))));
  const done = [];
  // Färg före vitt; läget byts automatiskt av de flesta lampor, annars försöker vi sätta det.
  if (num('hue') !== null && has('light_hue')) {
    await set('light_mode', 'color').catch(() => {});
    await set('light_hue', num('hue'));
    if (num('sat') !== null && has('light_saturation')) await set('light_saturation', num('sat'));
    done.push('färg');
  } else if (num('temp') !== null && has('light_temperature')) {
    await set('light_mode', 'temperature').catch(() => {});
    await set('light_temperature', num('temp'));
    done.push('vit');
  }
  if (num('dim') !== null && has('dim')) {
    await set('dim', Math.max(0.01, num('dim')));
    done.push('dim');
  }
  if (a.on !== undefined) {
    await set('onoff', a.on === true || a.on === 'true');
    done.push(String(a.on) === 'true' ? 'på' : 'av');
  } else if (done.length) {
    await set('onoff', true); // Ändrad lampa tänds.
  }
  log(`${d.name}: ${done.join(', ') || 'inget'}`);
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
    await Promise.resolve(set(d, 'light_mode', 'color')).catch(() => {}); // inte alla lampor tillåter det
    await set(d, 'light_hue', color.hue);
    await set(d, 'light_saturation', color.sat);
    await set(d, 'dim', color.dim);
  } else {
    await Promise.resolve(set(d, 'light_mode', 'temperature')).catch(() => {});
    await set(d, 'light_temperature', s.temp);
    await set(d, 'dim', s.dim);
  }
  return set(d, 'onoff', true);
}));

const failed = results.filter((r) => r.status === 'rejected').length;
log(`${a.scene}: ${lights.length - failed}/${lights.length} lampor`);
return failed === 0;
