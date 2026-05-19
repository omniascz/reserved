'use client';

import { useEffect, useState } from 'react';
import { clearAuth, getAccessToken, getImpersonatedBy, setAuth } from '@/lib/api';

/**
 * Cervena lista nahore stranky, kdyz je session impersonovana master adminem.
 *
 * Detekce: po nacteni stranky parsuje URL hash. Pokud najde #impersonate=<token>,
 * ulozi ho do localStorage a redirectuje na /dashboard. Jinak ctie token z
 * localStorage a kdyz nese impersonatedBy claim, zobrazi banner.
 */
export function ImpersonationBanner() {
  const [impersonatedBy, setImpersonatedBy] = useState<string | null>(null);

  useEffect(() => {
    // Krok 1: parsuj hash z URL (kdyz nas master admin presmeroval)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);
      const token = params.get('impersonate');
      if (token) {
        clearAuth();
        // Pri impersonation nemame refresh token (krátká platnost) — pouzijeme token i jako 'refresh' placeholder.
        // Pri vyprseni 15 minut musi master admin udelat novou impersonaci.
        // Tenant slug zatim neznáme — extrahujeme z tokenu (claim tenantId, ale neresolvuje na slug).
        // Pro DevAutoLogin pripad pouzijeme 'demo' fallback z URL params.
        const slug = params.get('tenantSlug') ?? 'demo';
        setAuth(token, token, slug);
        history.replaceState(null, '', window.location.pathname);
        window.location.replace('/dashboard');
        return;
      }
    }
    setImpersonatedBy(getImpersonatedBy());
  }, []);

  function exitImpersonation(): void {
    clearAuth();
    window.location.replace('/login');
  }

  if (!impersonatedBy) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between text-sm sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <span className="text-base">⚠️</span>
        <strong>Impersonace:</strong>
        <span>jsi přihlášen jako vlastník tohoto tenanta z master adminu.</span>
      </div>
      <button
        type="button"
        onClick={exitImpersonation}
        className="bg-red-800 hover:bg-red-900 px-3 py-1 rounded text-sm font-medium"
      >
        Ukončit impersonaci
      </button>
    </div>
  );
}
