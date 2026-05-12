'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  passwordLogin,
  PortalApiError,
  requestMagicLink,
  setAuth,
  setCustomerEmail,
  setTenantSlug,
} from '@/lib/api';

type Mode = 'magic' | 'password';

export default function LoginPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (tenant) setTenantSlug(tenant);
  }, [tenant]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestMagicLink(tenant, email, firstName || undefined, lastName || undefined);
      setCustomerEmail(email);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tokens = await passwordLogin(tenant, email, password);
      setAuth(tokens.accessToken, tokens.refreshToken);
      setCustomerEmail(email);
      router.push(`/${tenant}/bookings`);
    } catch (e) {
      if (e instanceof PortalApiError && e.code === 'INVALID_CREDENTIALS') {
        setError('Špatný e-mail nebo heslo.');
      } else {
        setError(e instanceof Error ? e.message : 'Chyba');
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-bold mb-2">Zkontroluj e-mail</h1>
          <p className="text-slate-600 mb-1">
            Poslali jsme přihlašovací odkaz na <strong>{email}</strong>.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Odkaz vyprší za 15 minut. Stačí kliknout a budeš přihlášen/a.
          </p>
          <button
            onClick={() => {
              setSent(false);
              setEmail('');
            }}
            className="text-brand-600 hover:text-brand-700 text-sm font-medium"
          >
            Použít jiný e-mail
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-1">Moje rezervace</h1>
        <p className="text-sm text-slate-500 mb-6">Přihlas se a spravuj svoje termíny.</p>

        <div className="flex border border-slate-200 rounded-lg p-1 mb-5 text-sm">
          <button
            type="button"
            onClick={() => setMode('magic')}
            className={`flex-1 py-2 rounded-md font-medium transition ${
              mode === 'magic' ? 'bg-brand-600 text-white' : 'text-slate-600'
            }`}
          >
            Přihlašovací odkaz
          </button>
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`flex-1 py-2 rounded-md font-medium transition ${
              mode === 'password' ? 'bg-brand-600 text-white' : 'text-slate-600'
            }`}
          >
            E-mail + heslo
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {mode === 'magic' ? (
          <form onSubmit={handleMagicLink} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jana@email.cz"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">Jméno</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jana"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Příjmení</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nováková"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Jméno a příjmení pomůžeme vyplnit, pokud je registrace nová.
            </p>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Posílám…' : 'Pošli mi odkaz'}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePassword} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">
                Heslo si nastavíš až po prvním přihlášení odkazem.
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Přihlašuju…' : 'Přihlásit se'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
