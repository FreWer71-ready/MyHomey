import { redirect } from 'next/navigation';

// Rum och Favoriter är samma sida (rumskorten med detaljer finns på Favoriter).
export default function RoomsIndex() {
  redirect('/favoriter');
}
