import { redirect } from 'next/navigation';
import { loadHome } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function RoomsIndex() {
  const home = await loadHome();
  redirect(home.rooms[0] ? `/rum/${home.rooms[0].id}` : '/');
}
