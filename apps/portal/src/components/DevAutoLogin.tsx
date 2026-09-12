'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAccessToken, passwordLogin, setAuth, setTenantSlug, setCustomerEmail } from '@/lib/api';

const DEMO_EMAIL = 'jan@demo.local';
const DEMO_PASSWORD = 'heslo123';

export function DevAutoLogin({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tenant?: string }>();
  const tenant = params?.tenant;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      setReady(true);
      return;
    }
    if (!tenant) {
      setReady(true);
      return;
    }
    if (getAccessToken()) {
      setTenantSlug(tenant);
      setReady(true);
      return;
    }
    (async () => {
      try {
        setTenantSlug(tenant);
        const tokens = await passwordLogin(tenant, DEMO_EMAIL, DEMO_PASSWORD);
        setAuth(tokens.accessToken, tokens.refreshToken);
        setCustomerEmail(DEMO_EMAIL);
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
