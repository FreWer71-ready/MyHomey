import { redirect } from 'next/navigation';
import { loadHome } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function RoomsIndex() {
  const home = await loadHome();
  // Standard: Hela hemmet (när det finns), annars första rummet.
  const first = home.rootZoneId && home.homeMoods.length ? home.rootZoneId : home.rooms[0]?.id;
  redirect(first ? `/rum/${first}` : '/');
}
