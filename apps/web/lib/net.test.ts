import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeNet, type NetDevice, type NetIsp } from './net.ts';

const now = Date.parse('2026-11-12T08:00:00Z');
const status = { isp: 'Telia', wifi_clients: 16, wired_clients: 3, internet_issues: [], checked_at: '2026-11-12T07:58:00Z' };
const row = (ts: string, latency = 3, extra: Partial<NetIsp> = {}): NetIsp => ({ ts, latency_ms: latency, packet_loss: 0, download_kbps: 300000, upload_kbps: 300000, uptime: 100, downtime: 0, ...extra });
const dev = (id: string, status = 'online', extra: Partial<NetDevice> = {}): NetDevice => ({ id, name: id, model: null, status, firmware_status: 'upToDate', is_console: false, ...extra });

test('internet ok med snitt, hastighet och klienter', () => {
  const n = summarizeNet(status, [row('2026-11-12T07:40:00Z', 5), row('2026-11-12T07:45:00Z', 3)], [dev('ap')], now)!;
  assert.equal(n.state, 'ok');
  assert.deepEqual([n.latency, n.avgLatency, n.downMbit, n.clients], [3, 4, 300, 19]);
});

test('nere: konsol offline, avbrott eller gamla mätvärden; okänt när synken stannat', () => {
  const fresh = [row('2026-11-12T07:45:00Z')];
  assert.equal(summarizeNet(status, fresh, [dev('ux', 'offline', { is_console: true })], now)!.state, 'down');
  assert.equal(summarizeNet(status, [row('2026-11-12T07:45:00Z', 3, { downtime: 60, uptime: 80 })], [], now)!.state, 'down');
  // Mätvärden en timme gamla är normalt (molnet skickar i omgångar); flera timmar = okänt, inte nere.
  assert.equal(summarizeNet(status, [row('2026-11-12T06:55:00Z')], [], now)!.state, 'ok');
  assert.equal(summarizeNet(status, [row('2026-11-12T04:00:00Z')], [], now)!.state, 'unknown');
  assert.equal(summarizeNet({ ...status, checked_at: '2026-11-12T07:00:00Z' }, fresh, [], now)!.state, 'unknown');
  assert.equal(summarizeNet(status, [row('2026-11-12T07:45:00Z', 80)], [], now)!.state, 'slow');
  assert.equal(summarizeNet(null, fresh, [], now), null);
});

test('enheter offline och firmwareuppdateringar', () => {
  const n = summarizeNet(status, [row('2026-11-12T07:45:00Z')], [dev('a', 'offline'), dev('b', 'online', { firmware_status: 'updateAvailable' })], now)!;
  assert.deepEqual([n.offline.map((d) => d.id), n.updates.map((d) => d.id)], [['a'], ['b']]);
});
