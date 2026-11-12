import { BASE_PATH } from '@/lib/paths';
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyHomey',
    short_name: 'MyHomey',
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    // Installerad som app: helskärm utan adressfält (Chrome på Android).
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    background_color: '#070A14',
    theme_color: '#070A14',
    icons: [
      { src: `${BASE_PATH}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${BASE_PATH}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${BASE_PATH}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: `${BASE_PATH}/icon.svg`, sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
