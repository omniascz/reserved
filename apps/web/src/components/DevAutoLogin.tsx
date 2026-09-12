'use client';

import { useEffect, useState } from 'react';
import { clearAuth, getAccessToken, login, setAuth } from '@/lib/api';

// Přihlašovací údaje NEJSOU v kódu — berou se z env (viz .env.example).
// Bez nich se komponenta nepřihlašuje a jen vykreslí obsah.
const DEV_TENANT = 'demo';
const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL;
const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD;
const AUTO_LOGIN_ENABLED =
  process.env.NODE_ENV === 'development' && Boolean(DEV_EMAIL) && Boolean(DEV_PASSWORD);

function isTokenExpiredOrInvalid(token: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    if (typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

export function DevAutoLogin({ children }: { children: React.ReactNode }) {
  // Bez dev-login proměnných je ready hned true → komponenta nic nedělá.
  const [ready, setReady] = useState(!AUTO_LOGIN_ENABLED);

  useEffect(() => {
    if (!AUTO_LOGIN_ENABLED || !DEV_EMAIL || !DEV_PASSWORD) {
      setReady(true);
      return;
    }
    // Neprihlasovat se automaticky, kdyz prichazi impersonation token z master adminu.
    if (typeof window !== 'undefined' && window.location.hash.includes('impersonate=')) {
      return;
    }
    const existing = getAccessToken();
    if (existing && !isTokenExpiredOrInvalid(existing)) {
      setReady(true);
      return;
    }
    if (existing) clearAuth();

    (async () => {
      try {
        const tokens = await login(DEV_TENANT, DEV_EMAIL, DEV_PASSWORD);
        setAuth(tokens.accessToken, tokens.refreshToken, DEV_TENANT);
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
