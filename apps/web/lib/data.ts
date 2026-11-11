import 'server-only';
import { createClient } from './supabase/server';
import { buildHome, CAPS, type Cap, type Device, type Home, type Zone } from './home';

/** Lokalt demoläge (bara `next dev`): läser JSON i stället för Supabase. */
export const DEMO = process.env.NODE_ENV === 'development' ? process.env.DEMO_DATA : undefined;

export async function loadHome(): Promise<Home> {
  if (DEMO) {
    const { readFile } = await import('node:fs/promises');
    const d = JSON.parse(await readFile(DEMO, 'utf8'));
    return buildHome(d.zones, d.devices, d.caps);
  }
  const sb = await createClient();
  const [zones, devices, caps] = await Promise.all([
    sb.from('zones').select('id,name,parent_id'),
    sb.from('devices').select('id,name,zone_id,class,available'),
    sb.from('capability_state').select('device_id,capability_id,value_num,value_bool').in('capability_id', CAPS),
  ]);
  const error = zones.error ?? devices.error ?? caps.error;
  if (error) throw new Error(`Kunde inte läsa data: ${error.message}`);
  return buildHome(zones.data as Zone[], devices.data as Device[], caps.data as Cap[]);
}
