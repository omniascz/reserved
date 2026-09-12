import type { MetadataRoute } from 'next';

// PWA manifest pro klientský portál — umožní „přidat na plochu" / instalaci.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Moje rezervace',
    short_name: 'Rezervace',
    description: 'Vaše rezervace, permanentky a předplatné na jednom místě.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f172a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
