import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MyHomey',
  description: 'Dashboard för hemmet',
  icons: { icon: '/mydashboard/icon.svg', apple: '/mydashboard/icon.svg' },
  manifest: '/mydashboard/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MyHomey', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#12162B' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
