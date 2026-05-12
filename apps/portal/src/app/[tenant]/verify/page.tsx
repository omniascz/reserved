'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { setAuth, setTenantSlug, verifyMagicLink } from '@/lib/api';

export default function VerifyPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    setTenantSlug(tenant);
    const token = search.get('token');
    if (!token) {
      setError('Odkaz neobsahuje token. Otevři ho přímo z e-mailu.');
      return;
    }
    verifyMagicLink(tenant, token)
      .then((tokens) => {
        setAuth(tokens.accessToken, tokens.refreshToken);
        router.replace(`/${tenant}/bookings`);
      })
      .catch((e) => {
        setError(e?.message ?? 'Odkaz je neplatný nebo vypršel.');
      });
  }, [tenant, search, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        {error ? (
          <>
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              !
            </div>
            <h1 className="text-xl font-bold mb-2">Něco se nepovedlo</h1>
            <p className="text-slate-600 mb-6">{error}</p>
            <a
              href={`/${tenant}/login`}
              className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
            >
              Zpět na přihlášení
            </a>
          </>
        ) : (
          <>
            <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-2">Přihlašujeme tě…</h1>
            <p className="text-slate-600">Za chvíli budeš ve svém účtu.</p>
          </>
        )}
      </div>
    </main>
  );
}
