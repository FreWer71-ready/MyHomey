import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commuteAlerts, direction, parseCommute, type RawCommute } from './commute.ts';

const now = Date.parse('2026-11-12T15:30:00+01:00');
const raw: RawCommute = {
  out: [
    { AdvertisedTrainIdent: '950', AdvertisedTimeAtLocation: '2026-11-12T15:04:00+01:00', TimeAtLocation: '2026-11-12T15:05:00+01:00', LocationSignature: 'Et', ToLocation: [{ LocationName: 'U' }] },
    { AdvertisedTrainIdent: '954', AdvertisedTimeAtLocation: '2026-11-12T16:02:00+01:00', EstimatedTimeAtLocation: '2026-11-12T16:14:00+01:00', LocationSignature: 'Et', ToLocation: [{ LocationName: 'U' }], TrackAtLocation: '1', Deviation: [{ Description: 'Försenad' }, { Description: 'Buss ersätter' }, { Description: 'Buss ersätter' }] },
    { AdvertisedTrainIdent: '922', AdvertisedTimeAtLocation: '2026-11-12T16:34:00+01:00', Canceled: true, LocationSignature: 'Et', ToLocation: [{ LocationName: 'Cst' }] },
  ],
  home: [{ AdvertisedTrainIdent: '921', AdvertisedTimeAtLocation: '2026-11-12T15:23:00+01:00', LocationSignature: 'Cst', ToLocation: [{ LocationName: 'Et' }] }],
  arrivals: [{ AdvertisedTrainIdent: '954', LocationSignature: 'Cst', AdvertisedTimeAtLocation: '2026-11-12T17:05:00+01:00' }],
  situations: [
    { Deviation: [
      { Id: 'a', MessageType: 'Vägarbete', MessageTypeValue: 'MaintenanceWorks', SeverityCode: 4, Suspended: true, Message: 'Broarbete. ', LocationDescriptor: 'Väg 56 vid Kvicksundsbron', Geometry: { Point: { WGS84: 'POINT (16.3196 59.4523)' } } },
      { Id: 'a2', MessageTypeValue: 'SpeedManagement', Suspended: true, Geometry: { Point: { WGS84: 'POINT (16.3196 59.4523)' } } },
    ] },
    { Deviation: [{ Id: 'b', MessageType: 'Olycka', MessageTypeValue: 'Accident', SeverityCode: 4, LocationDescriptor: 'Sverige', Geometry: { Point: { WGS84: 'POINT (16.45 59.40)' } } }] },
    { Deviation: [{ Id: 'c', MessageType: 'Vägarbete', MessageTypeValue: 'MaintenanceWorks', SeverityCode: 5, Geometry: { Point: { WGS84: 'POINT (16.61 59.91)' } } }] },
    { Deviation: [{ Id: 'd', MessageType: 'Vägarbete', MessageTypeValue: 'MaintenanceWorks', SeverityCode: 2, EndTime: '2026-11-01T00:00:00+01:00' }] },
  ],
};

test('pendling: avgångna tåg bort, försening, inställt, ankomst och slutstation', () => {
  const c = parseCommute(raw, 'Et', 'Cst', now);
  assert.deepEqual(c.out.map((x) => x.ident), ['954', '922']);
  assert.equal(c.out[0].delay, 12);
  assert.equal(c.out[0].dest, 'Uppsala C');
  assert.deepEqual(c.out[0].notes, ['Buss ersätter']);
  assert.equal(c.out[0].arr, Date.parse('2026-11-12T17:05:00+01:00'));
  assert.equal(c.out[1].canceled, true);
  assert.equal(c.home.length, 0); // 15:23 har gått
});

test('pendling: väg 56 inom sträckan, incidenter först, pausade sist', () => {
  const c = parseCommute(raw, 'Et', 'Cst', now);
  assert.deepEqual(c.road.map((r) => r.id), ['b', 'a']);
  assert.equal(c.road[0].place, null);
  assert.equal(c.road[1].text, 'Broarbete');
  assert.equal(c.road[1].suspended, true);
});

test('pendling: riktning och varningar', () => {
  assert.equal(direction(Date.parse('2026-11-12T07:00:00+01:00')), 'out');
  assert.equal(direction(now), 'home');
  const c = parseCommute(raw, 'Et', 'Cst', now);
  const morning = Date.parse('2026-11-12T10:30:00+01:00');
  const shifted = { ...c, out: c.out.map((x) => ({ ...x, dep: x.dep - 5 * 3600_000 })) };
  const fmt = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).format(ms);
  assert.deepEqual(commuteAlerts(shifted, morning, fmt).map((a) => a.label), [
    'Tåg 11:02 mot Stockholm +12 min', 'Tåg 11:34 mot Stockholm inställt', 'Väg 56: olycka',
  ]);
});
