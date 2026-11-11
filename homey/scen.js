// Scen per rum: Ljust / Mys / Släck för alla lampor i en zon.
// Flöde: NÄR Logik → "Webhook tas emot", händelse: scen
//        DÅ 1) HomeyScript → "Kör med argument": scen, argument = [Tag]
//           2) HomeyScript → "Kör": Dashboard (fördröjning 2 s) – skickar nytt läge till dashboarden
// Argument (JSON från dashboarden): {"zone":"<zon-id>","scene":"ljust|mys|slack"}

const SCENES = {
  ljust: { on: true, dim: 1.0, temp: 0.3 }, // light_temperature: 0 = kallt, 1 = varmt
  mys: { on: true, dim: 0.3, temp: 0.9 },
  slack: { on: false },
};

const a = JSON.parse(args[0] || '{}');
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
