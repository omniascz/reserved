'use client';

import { useEffect, useState } from 'react';
import { login, setAuth, getAccessToken } from '@/lib/api';

const DEMO_TENANT = 'demo';
const DEMO_EMAIL = 'admin@demo.local';
const DEMO_PASSWORD = 'admin123';

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
        const tokens = await login(DEMO_TENANT, DEMO_EMAIL, DEMO_PASSWORD);
        setAuth(tokens.accessToken, tokens.refreshToken, DEMO_TENANT);
        if (window.location.pathname === '/login') {
          window.location.replace('/dashboard');
          return;
        }
        window.location.reload();
      } catch (err) {
        console.error('[DevAutoLogin] failed:', err);
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Přihlašuji dev uživatele…
      </div>
    );
  }
  return <>{children}</>;
}
