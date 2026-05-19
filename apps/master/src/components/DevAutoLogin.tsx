'use client';

import { useEffect, useState } from 'react';
import { getAccessToken, login, setAuth } from '@/lib/api';

const DEMO_EMAIL = 'omniascz@gmail.com';
const DEMO_PASSWORD = 'reserved2026';

export function DevAutoLogin({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      setReady(true);
      return;
    }
    if (getAccessToken()) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const tokens = await login(DEMO_EMAIL, DEMO_PASSWORD);
        setAuth(tokens.accessToken, tokens.refreshToken);
        if (window.location.pathname === '/login') {
          window.location.replace('/');
          return;
        }
        window.location.reload();
      } catch (err) {
        console.error('[DevAutoLogin master] failed:', err);
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Přihlašuji master admina…
      </div>
    );
  }
  return <>{children}</>;
}
