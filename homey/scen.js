// Scen per rum: Ljust / Mys / Släck för alla lampor i en zon.
// Flöde: NÄR "Webhook tas emot: scen" → DÅ HomeyScript "Kör scen med argument [tag]".
// Argument (JSON): {"secret":"…","zone":"<zon-id>","scene":"ljust|mys|slack"}
// Fyll i SECRET här på Homey. Spara aldrig hemligheten i git.

const SECRET = 'KLISTRA_IN_SCENHEMLIGHET';

const SCENES = {
  ljust: { on: true, dim: 1.0, temp: 0.3 },  // light_temperature: 0 = kallt, 1 = varmt
  mys:   { on: true, dim: 0.3, temp: 0.9 },
  slack: { on: false },
};

const a = JSON.parse(args[0] || '{}');
if (a.secret !== SECRET) throw new Error('unauthorized');
const s = SCENES[a.scene];
if (!s) throw new Error(`Okänd scen: ${a.scene}`);

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
