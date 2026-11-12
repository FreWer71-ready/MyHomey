import { Nav } from '@/components/Nav';
import { LiveRefresh } from '@/components/LiveRefresh';
import { alarmKeys } from '@/lib/alerts';
import { loadHome, loadWeather } from '@/lib/data';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Larmnycklar till menyn (klockan markeras när något nytt dykt upp). Får aldrig stoppa sidan.
  const alarms = await Promise.all([loadHome(), loadWeather()])
    .then(([h, w]) => alarmKeys(h, w))
    .catch(() => []);
  return (
    <div className="flex min-h-dvh">
      <Nav alarms={alarms} />
      <LiveRefresh />
      <main className="flex min-w-0 grow flex-col gap-3 p-3 pb-28 md:p-4">{children}</main>
    </div>
  );
}
