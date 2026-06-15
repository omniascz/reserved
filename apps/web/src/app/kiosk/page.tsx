'use client';

// Kiosk self-check-in — tablet na recepci. Klient zadá vstupní PIN, systém
// ověří (access control) a velkým ✓/✗ ukáže výsledek. Bez personálu.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AccessValidateResult,
  AdminApiError,
  clearAuth,
  getAccessToken,
  validateAccessCode,
} from '@/lib/api';

const DENY_MESSAGES: Record<string, string> = {
  not_found: 'Kód neplatí',
  revoked: 'Kód byl zrušen',
  not_yet_valid: 'Ještě není čas vstupu',
  expired: 'Platnost vypršela',
  used_up: 'Kód už byl vyčerpán',
  wrong_branch: 'Kód je pro jinou pobočku',
};

export default function KioskPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AccessValidateResult | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reset = useCallback(() => {
    setResult(null);
    setCode('');
  }, []);

  const submit = useCallback(async () => {
    if (code.length < 4 || busy) return;
    setBusy(true);
    try {
      const r = await validateAccessCode(code);
      setResult(r);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        clearAuth();
        router.replace('/login');
        return;
      }
      setResult({ granted: false, reason: 'not_found' });
    } finally {
      setBusy(false);
    }
  }, [code, busy, router]);

  // Po zobrazení výsledku auto-reset za 4 s.
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(reset, 4000);
    return () => clearTimeout(id);
  }, [result, reset]);

  const press = (d: string) => setCode((c) => (c.length < 8 ? c + d : c));

  if (result) {
    return (
      <div
        onClick={reset}
        className={`min-h-screen flex flex-col items-center justify-center text-center cursor-pointer ${
          result.granted ? 'bg-emerald-600' : 'bg-red-600'
        } text-white`}
      >
        <div className="text-9xl mb-4">{result.granted ? '✓' : '✕'}</div>
        <div className="text-4xl font-bold">
          {result.granted ? 'Vstup povolen' : 'Vstup zamítnut'}
        </div>
        {result.granted ? (
          result.customerName && (
            <div className="text-2xl mt-2 opacity-90">Vítejte, {result.customerName}!</div>
          )
        ) : (
          <div className="text-2xl mt-2 opacity-90">
            {DENY_MESSAGES[result.reason] ?? 'Neplatný kód'}
          </div>
        )}
        <div className="text-sm mt-8 opacity-70">Klepni pro další</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
      <h1 className="text-3xl font-bold mb-2">Vstup na čip</h1>
      <p className="text-slate-400 mb-6">Zadej svůj vstupní kód</p>

      <div className="text-5xl font-mono tracking-widest h-16 mb-6 min-w-[200px] text-center">
        {code.replace(/./g, '•') || <span className="text-slate-600">––––</span>}
      </div>

      <div className="grid grid-cols-3 gap-3 w-72">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="aspect-square rounded-2xl bg-slate-800 hover:bg-slate-700 text-3xl font-semibold"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => setCode((c) => c.slice(0, -1))}
          className="aspect-square rounded-2xl bg-slate-800 hover:bg-slate-700 text-2xl"
        >
          ⌫
        </button>
        <button
          onClick={() => press('0')}
          className="aspect-square rounded-2xl bg-slate-800 hover:bg-slate-700 text-3xl font-semibold"
        >
          0
        </button>
        <button
          onClick={submit}
          disabled={code.length < 4 || busy}
          className="aspect-square rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-2xl font-bold disabled:opacity-40"
        >
          {busy ? '…' : '✓'}
        </button>
      </div>
    </div>
  );
}
