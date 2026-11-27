import type { Metadata, Viewport } from 'next';
import { Backdrop } from '@/components/Backdrop';
import { PLACE, loadWeather } from '@/lib/data';
import { conditionOf, skyState, solarElevation } from '@/lib/sky';
import { BASE_PATH } from '@/lib/paths';
import './globals.css';

export const metadata: Metadata = {
  title: 'MyHomey',
  description: 'Dashboard för hemmet',
  icons: { icon: `${BASE_PATH}/icon.svg`, apple: `${BASE_PATH}/icon.svg` },
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: 'MyHomey', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#070A14', colorScheme: 'dark' };

/**
 * Två lägen, valda per installation och enhet (ingen zoom, allt är i rem):
 * - Standard: text 1×, tre kolumner på Hem.
 * - Stor: text UI_SCALE× (t.ex. 1,5 hos Ulrika, annars 1,4), två kolumner på Hem.
 * Standardläget per installation: Stor om UI_SCALE > 1. Knappen Aa i menyn byter läge; valet sparas på enheten
 * (localStorage "ui-mode") och sätts här före första ritningen, så att sidan inte hoppar.
 */
const modeScript = (big: number, def: 'standard' | 'stor') => `(function(){try{var m=localStorage.getItem('ui-mode')||'${def}';
var d=document.documentElement;d.dataset.mode=m;d.dataset.cols=m==='stor'?'2':'3';d.style.setProperty('--ui-scale',m==='stor'?'${big}':'1');}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const scale = Number(process.env.UI_SCALE) || 1;
  const big = scale > 1 ? scale : 1.4;
  const def = scale > 1 ? 'stor' : 'standard';
  const weather = await loadWeather();
  const sky = skyState(weather?.current);
  return (
    <html lang="sv" data-farger={process.env.HOME_COLORS || undefined} data-mode={def} data-cols={def === 'stor' ? '2' : '3'} data-big={big} style={{ '--ui-scale': def === 'stor' ? big : 1 } as React.CSSProperties} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: modeScript(big, def) }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- rotlayouten gäller alla sidor i App Router */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
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
