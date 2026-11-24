import { Suspense } from 'react';
import { Nav } from '@/components/Nav';
import { LiveRefresh } from '@/components/LiveRefresh';
import { SparadSida } from '@/components/SparadSida';
import { APP_VERSION } from '@/lib/version';
import { BirthdayOverlay } from '@/components/BirthdayOverlay';
import { parseBirthdays } from '@/lib/birthday';
import { alarmKeys } from '@/lib/alerts';
import { loadHome, loadNet, loadWarnings, loadWeather } from '@/lib/data';
import { calendarConfigured } from '@/lib/calendar-source';
import { mirrorConfigured } from '@/lib/calendar-mirror';

/** Menyn med larmmarkering. Datat hämtas strömmande, så att sidan inte väntar på det. Får aldrig stoppa sidan. */
async function AlarmNav({ calendar }: { calendar: boolean }) {
  const alarms = await Promise.all([loadHome(), loadWeather(), loadNet()])
    .then(async ([h, w, n]) => alarmKeys(h, w, n, await loadWarnings(w)))
    .catch(() => []);
  return <Nav alarms={alarms} calendar={calendar} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const calendar = calendarConfigured() || mirrorConfigured();
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<Nav calendar={calendar} />}><AlarmNav calendar={calendar} /></Suspense>
      <LiveRefresh />
      <SparadSida />
      <BirthdayOverlay entries={parseBirthdays(process.env.BIRTHDAYS)} />
      <main className="flex min-w-0 grow flex-col gap-3 p-3 pb-28 md:p-4">
        {children}
        {/* Versionen längst ned på alla sidor i mobilen (på större skärm ligger den i sidomenyn). */}
        <p className="mt-1 text-center text-[0.75rem] font-semibold tracking-wide text-mute md:hidden" title={`Version ${APP_VERSION.replace(/^V/, '')}`}>MyHomey {APP_VERSION}</p>
      </main>
    </div>
  );
}
