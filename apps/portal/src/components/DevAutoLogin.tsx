'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  clearAuth,
  getAccessToken,
  passwordLogin,
  setAuth,
  setCustomerEmail,
  setTenantSlug,
} from '@/lib/api';

// Přihlašovací údaje NEJSOU v kódu — berou se z env (viz .env.example).
// Bez nich se komponenta nepřihlašuje a jen vykreslí obsah.
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
  const params = useParams<{ tenant?: string }>();
  const tenant = params?.tenant;
  // Bez dev-login proměnných je ready hned true → komponenta nic nedělá.
  const [ready, setReady] = useState(!AUTO_LOGIN_ENABLED);

  useEffect(() => {
    if (!AUTO_LOGIN_ENABLED || !DEV_EMAIL || !DEV_PASSWORD) {
      setReady(true);
      return;
    }
    if (!tenant) {
      setReady(true);
      return;
    }
    const existing = getAccessToken();
    if (existing && !isTokenExpiredOrInvalid(existing)) {
      setTenantSlug(tenant);
      setReady(true);
      return;
    }
    if (existing) clearAuth();

    (async () => {
      try {
        setTenantSlug(tenant);
        const tokens = await passwordLogin(tenant, DEV_EMAIL, DEV_PASSWORD);
        setAuth(tokens.accessToken, tokens.refreshToken);
        setCustomerEmail(DEV_EMAIL);
        const path = window.location.pathname;
        if (path.endsWith('/login') || path === `/${tenant}` || path === `/${tenant}/`) {
          window.location.replace(`/${tenant}/bookings`);
          return;
        }
        window.location.reload();
      } catch (err) {
        console.error('[DevAutoLogin portal] failed:', err);
        setReady(true);
      }
    })();
  }, [tenant]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Přihlašuji dev zákazníka…
      </div>
    );
  }
  return <>{children}</>;
}
