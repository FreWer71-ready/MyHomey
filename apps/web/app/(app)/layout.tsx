import { Suspense } from 'react';
import { Nav } from '@/components/Nav';
import { LiveRefresh } from '@/components/LiveRefresh';
import { alarmKeys } from '@/lib/alerts';
import { loadHome, loadNet, loadWarnings, loadWeather } from '@/lib/data';

/** Menyn med larmmarkering. Datat hämtas strömmande, så att sidan inte väntar på det. Får aldrig stoppa sidan. */
async function AlarmNav() {
  const alarms = await Promise.all([loadHome(), loadWeather(), loadNet()])
    .then(async ([h, w, n]) => alarmKeys(h, w, n, await loadWarnings(w)))
    .catch(() => []);
  return <Nav alarms={alarms} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<Nav />}><AlarmNav /></Suspense>
      <LiveRefresh />
      <main className="flex min-w-0 grow flex-col gap-3 p-3 pb-28 md:p-4">{children}</main>
    </div>
  );
}
