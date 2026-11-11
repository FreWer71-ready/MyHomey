import type { Metadata, Viewport } from 'next';
import { Backdrop } from '@/components/Backdrop';
import { PLACE, loadWeather } from '@/lib/data';
import { backgroundSrc } from '@/lib/sky';
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
  const bg = backgroundSrc(weather?.current.symbol, Date.now(), PLACE.lat, PLACE.lon);
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
        <Backdrop src={bg} />
        {children}
      </body>
    </html>
  );
}
