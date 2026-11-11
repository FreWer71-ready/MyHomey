import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyHomey',
    short_name: 'MyHomey',
    start_url: '/mydashboard/',
    scope: '/mydashboard/',
    // Installerad som app: helskärm utan adressfält (Chrome på Android).
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    background_color: '#070A14',
    theme_color: '#070A14',
    icons: [
      { src: '/mydashboard/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/mydashboard/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/mydashboard/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/mydashboard/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
