import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyHomey',
    short_name: 'MyHomey',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#F4F6FB',
    theme_color: '#12162B',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
