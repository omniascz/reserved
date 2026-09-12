'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  issueMakeupCredit,
  listMakeupCredits,
  type AdminMakeupCredit,
} from '@/lib/api';

const REASON_LABEL: Record<string, string> = {
  studio_cancelled: 'Studio zrušilo lekci',
  client_cancelled: 'Klient zrušil včas',
  admin_granted: 'Přiděleno ručně',
};

const STATUS_LABEL: Record<string, string> = {
  available: 'K dispozici',
  used: 'Použito',
  expired: 'Vypršelo',
  cancelled: 'Zrušeno',
};

interface FormState {
  customerName: string;
  customerEmail: string;
  reason: 'studio_cancelled' | 'client_cancelled' | 'admin_granted';
  validDays: number;
}

const EMPTY_FORM: FormState = {
  customerName: '',
  customerEmail: '',
  reason: 'admin_granted',
  validDays: 60,
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

export default function MakeupCreditsPage() {
  const router = useRouter();
  const [credits, setCredits] = useState<AdminMakeupCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCredits(await listMakeupCredits());
      setError(null);
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) {
        clearAuth();
        router.replace('/login');
      } else {
        setError(e instanceof Error ? e.message : 'Chyba');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSave() {
    if (!form) return;
    setError(null);
    if (!form.customerName.trim() || !form.customerEmail.trim()) {
      setError('Jméno i e-mail jsou povinné.');
      return;
    }
    try {
      await issueMakeupCredit({
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        reason: form.reason,
        validDays: form.validDays,
      });
      setForm(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  const available = credits.filter((c) => c.status === 'available').length;

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Náhrady</h2>
            <p className="text-sm text-slate-500">
              Náhradní vstup za zrušenou lekci. Vydá se sám, když studio zruší lekci — nebo ho
              přidělíš ručně.
            </p>
          </div>
          <button
            onClick={() => setForm({ ...EMPTY_FORM })}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Vydat náhradu
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Celkem</div>
            <div className="text-xl font-bold">{credits.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">K dispozici</div>
            <div className="text-xl font-bold text-green-700">{available}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Použito</div>
            <div className="text-xl font-bold text-slate-600">
              {credits.filter((c) => c.status === 'used').length}
            </div>
          </div>
        </div>

        {form && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-lg font-bold mb-4">Vydat náhradu</h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Jméno a příjmení *</label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">E-mail *</label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Náhrada se při přihlášení do lekce páruje podle e-mailu.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Důvod</label>
                  <select
                    value={form.reason}
                    onChange={(e) =>
                      setForm({ ...form, reason: e.target.value as FormState['reason'] })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    {Object.entries(REASON_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Platnost (dní)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={form.validDays}
                    onChange={(e) => setForm({ ...form, validDays: Number(e.target.value) || 60 })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setForm(null)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  Vydat
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Klient</th>
                <th className="text-left px-4 py-3 font-semibold">E-mail</th>
                <th className="text-left px-4 py-3 font-semibold">Důvod</th>
                <th className="text-left px-4 py-3 font-semibold">Platí do</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="text-left px-4 py-3 font-semibold">Vydáno</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Načítám…
                  </td>
                </tr>
              )}
              {!loading && credits.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Žádné náhrady.
                  </td>
                </tr>
              )}
              {credits.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{c.customerName}</td>
                  <td className="px-4 py-3 text-slate-600">{c.customerEmail}</td>
                  <td className="px-4 py-3 text-slate-600">{REASON_LABEL[c.reason] ?? c.reason}</td>
                  <td className="px-4 py-3">{formatDate(c.validUntil)}</td>
                  <td className="text-center px-4 py-3 text-xs">
                    {c.status === 'available' ? (
                      <span className="text-green-700">{STATUS_LABEL[c.status]}</span>
                    ) : (
                      <span className="text-slate-500">{STATUS_LABEL[c.status] ?? c.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
