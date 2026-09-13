'use client';

// Cíl odkazu z ověřovacího e-mailu: /verify-email?token=…
//
// Token se bere z `searchParams` propu, ne z useSearchParams() — ta vyžaduje
// <Suspense> a bez něj rozbíjí prerender (zavedená konvence v tomhle repu).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { confirmEmailVerification } from '@/lib/api';

type Stav =
  | { kind: 'loading' }
  | { kind: 'ok'; email: string; alreadyVerified: boolean }
  | { kind: 'error'; message: string };

export default function VerifyEmailPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? '';
  const [stav, setStav] = useState<Stav>({ kind: 'loading' });

  // Token je JEDNORÁZOVÝ, takže se smí uplatnit právě jednou. React ve vývoji
  // vykreslí komponentu dvakrát a odeslaly by se dva požadavky: první token
  // spotřebuje, druhý dostane "už použit" — a protože dorazí jako poslední,
  // přepsal by úspěch chybovou hláškou. Uživateli by se to stalo i v ostrém
  // provozu při obnovení stránky nebo dvojím kliknutí na odkaz.
  const odeslano = useRef(false);

  useEffect(() => {
    if (!token) {
      setStav({ kind: 'error', message: 'Odkaz neobsahuje ověřovací kód.' });
      return;
    }
    if (odeslano.current) return;
    odeslano.current = true;

    confirmEmailVerification(token)
      .then((r) => setStav({ kind: 'ok', email: r.email, alreadyVerified: r.alreadyVerified }))
      .catch((e) =>
        setStav({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Ověření se nezdařilo.',
        }),
      );
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-md border border-slate-200 w-full max-w-md text-center">
        {stav.kind === 'loading' && <p className="text-slate-500">Ověřuji adresu…</p>}

        {stav.kind === 'ok' && (
          <>
            <div className="text-4xl mb-3">✅</div>
            <h1 className="text-2xl font-bold mb-1">
              {stav.alreadyVerified ? 'Adresa už byla ověřená' : 'E-mail potvrzen'}
            </h1>
            <p className="text-slate-600 text-sm mb-6">
              <span className="font-mono">{stav.email}</span> je ověřená. Rezervační formulář teď
              přijímá rezervace a můžete rozesílat e-maily klientům.
            </p>
            <Link
              href="/dashboard"
              className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
            >
              Pokračovat do administrace
            </Link>
          </>
        )}

        {stav.kind === 'error' && (
          <>
            <div className="text-4xl mb-3">⚠️</div>
            <h1 className="text-2xl font-bold mb-1">Odkaz nefunguje</h1>
            <p className="text-slate-600 text-sm mb-6">{stav.message}</p>
            <p className="text-slate-500 text-xs mb-4">
              Odkaz platí 24 hodin a jde použít jen jednou. Nový si necháte poslat ze žlutého pruhu
              v administraci.
            </p>
            <Link
              href="/dashboard"
              className="inline-block border border-slate-300 hover:bg-slate-50 font-medium px-4 py-2 rounded-lg"
            >
              Zpět do administrace
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
