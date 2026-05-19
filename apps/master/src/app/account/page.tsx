'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  changePassword,
  getAccessToken,
  getMe,
  MasterApiError,
  type MasterAdminMe,
} from '@/lib/api';
import { MasterNavHeader } from '@/components/MasterNavHeader';

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<MasterAdminMe | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    getMe()
      .then(setMe)
      .catch((e) => setError(e.message));
  }, [router]);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    setSuccess(null);
    if (next !== confirm) {
      setError('Hesla se neshoduji.');
      return;
    }
    if (next.length < 8) {
      setError('Heslo musi mit aspon 8 znaku.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setSuccess('Heslo zmeneno. Pristne pouzij nove heslo.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      if (e instanceof MasterApiError) setError(e.message);
      else setError('Chyba.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <MasterNavHeader />
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Účet</h1>

        {me && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-1">
            <h2 className="font-semibold mb-2">Profil</h2>
            <Row label="Jméno" value={`${me.firstName} ${me.lastName}`} />
            <Row label="E-mail" value={me.email} />
            <Row
              label="Poslední přihlášení"
              value={me.lastLoginAt ? new Date(me.lastLoginAt).toLocaleString('cs-CZ') : '—'}
            />
            <Row label="Účet vytvořen" value={new Date(me.createdAt).toLocaleDateString('cs-CZ')} />
          </section>
        )}

        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold mb-3">Změnit heslo</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-3">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm p-3 rounded mb-3">
              {success}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
            <Input
              label="Současné heslo"
              type="password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
            <Input
              label="Nové heslo"
              type="password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
            />
            <Input
              label="Nové heslo (potvrzení)"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Měním…' : 'Změnit heslo'}
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-3">
            Po změně budou všechna ostatní přihlášení (jiné prohlížeče) automaticky odhlášena.
          </p>
        </section>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Input({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        required
      />
    </div>
  );
}
