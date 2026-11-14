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
 * Större text per installation (UI_SCALE, t.ex. 1.5 hos Ulrika). Viewporten görs smalare i CSS-pixlar och skalas upp,
 * så att allt blir större och sidan själv väljer en layout med färre kolumner. Gäller pekskärmar (platta/mobil);
 * på dator används webbläsarens egen zoom.
 */
const scaleScript = (s: number) => `(function(){var s=${s};function a(){var ms=document.querySelectorAll('meta[name=viewport]');if(!ms.length)return;
var L=(screen.orientation&&screen.orientation.type.indexOf('landscape')===0)||window.innerWidth>window.innerHeight;
var w=L?Math.max(screen.width,screen.height):Math.min(screen.width,screen.height);
ms.forEach(function(m){m.setAttribute('content','width='+Math.round(w/s)+', initial-scale='+s+', viewport-fit=cover');});}
a();document.addEventListener('DOMContentLoaded',a);addEventListener('orientationchange',function(){setTimeout(a,250)});
new MutationObserver(function(r){for(var i=0;i<r.length;i++)for(var j=0;j<r[i].addedNodes.length;j++){var n=r[i].addedNodes[j];if(n.nodeName==='META'&&n.name==='viewport'){a();return;}}}).observe(document.documentElement,{childList:true,subtree:true});})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const scale = Number(process.env.UI_SCALE) || 1;
  const weather = await loadWeather();
  const sky = skyState(weather?.current);
  return (
    <html lang="sv">
      <head>
        {scale !== 1 && <script dangerouslySetInnerHTML={{ __html: scaleScript(scale) }} />}
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
