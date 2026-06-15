'use client';

import { useEffect } from 'react';

// Zaregistruje service worker (PWA). Běží jen v prohlížeči po načtení.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // registrace SW není kritická — portál funguje i bez ní
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
