import type { Metadata, Viewport } from 'next';
import { Backdrop } from '@/components/Backdrop';
import { PLACE, loadWeather } from '@/lib/data';
import { conditionOf, skyState, solarElevation } from '@/lib/sky';
import './globals.css';

export const metadata: Metadata = {
  title: 'MyHomey',
  description: 'Dashboard för hemmet',
  icons: { icon: '/mydashboard/icon.svg', apple: '/mydashboard/icon.svg' },
  manifest: '/mydashboard/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MyHomey', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#070A14', colorScheme: 'dark' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const weather = await loadWeather();
  const sky = skyState(weather?.current);
  return (
    <html lang="sv">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- rotlayouten gäller alla sidor i App Router */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
        />
      </head>
      <body className="font-sans antialiased">
        <Backdrop
          condition={conditionOf(weather?.current.symbol)} sky={sky}
          el0={solarElevation(Date.now(), PLACE.lat, PLACE.lon)} lat={PLACE.lat} lon={PLACE.lon}
        />
        {children}
      </body>
    </html>
  );
}
