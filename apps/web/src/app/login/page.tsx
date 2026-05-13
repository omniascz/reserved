'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, setAuth, AdminApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('demo-widget');
  const [email, setEmail] = useState('o@demo-widget.test');
  const [password, setPassword] = useState('verysecurepassword123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await login(tenantSlug, email, password);
      setAuth(tokens.accessToken, tokens.refreshToken, tenantSlug);
      router.replace('/dashboard');
    } catch (e) {
      if (e instanceof AdminApiError) {
        setError(e.message);
      } else {
        setError('Nelze se přihlásit.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-md border border-slate-200 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-1">Reserved Admin</h1>
        <p className="text-slate-500 text-sm mb-6">Přihlášení do administrace</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="slug">
              Slug salonu
            </label>
            <input
              id="slug"
              type="text"
              required
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="password">
              Heslo
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Přihlašuji…' : 'Přihlásit'}
          </button>
        </form>
      </div>
    </div>
  );
}
