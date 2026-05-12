'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createHoliday,
  deleteHoliday,
  getAccessToken,
  importCzHolidays,
  listHolidays,
  type AdminHoliday,
} from '@/lib/api';

export default function HolidaysPage() {
  const router = useRouter();
  const [holidays, setHolidays] = useState<AdminHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    name: '',
  });
  const currentYear = new Date().getFullYear();
  const [importYear, setImportYear] = useState(currentYear);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHolidays();
      setHolidays(data);
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createHoliday({ date: formData.date, name: formData.name });
      setShowForm(false);
      setFormData({ date: new Date().toISOString().slice(0, 10), name: '' });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleImport() {
    setError(null);
    setSuccess(null);
    try {
      const result = await importCzHolidays(importYear);
      setSuccess(
        `Naimportováno: ${result.inserted} svátků, přeskočeno (již existují): ${result.skipped}.`,
      );
      setTimeout(() => setSuccess(null), 5000);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Smazat tento svátek?')) return;
    try {
      await deleteHoliday(id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Svátky a zavřené dny</h2>
            <p className="text-sm text-slate-500">
              V tyto dny se zákazníkům ve widgetu nezobrazí volné termíny.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={importYear}
              onChange={(e) => setImportYear(Number(e.target.value) || currentYear)}
              min="2000"
              max="2100"
              className="w-24 px-3 py-2 border border-slate-300 rounded-lg"
            />
            <button
              onClick={handleImport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg"
            >
              Importovat CZ svátky
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
            >
              {showForm ? 'Zavřít' : '+ Vlastní den'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 rounded mb-4">
            {success}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleAdd}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-wrap gap-3 items-end"
          >
            <div>
              <label className="block text-sm font-medium mb-1">Datum</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Název</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Inventura, firemní výlet…"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium"
            >
              Přidat
            </button>
          </form>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Datum</th>
                <th className="text-left px-4 py-3 font-semibold">Název</th>
                <th className="text-left px-4 py-3 font-semibold">Zdroj</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && holidays.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-500">
                    Žádné svátky. Klikni „Importovat CZ svátky" pro auto-naplnění.
                  </td>
                </tr>
              )}
              {holidays.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono">
                    {new Date(h.date).toLocaleDateString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 font-medium">{h.name}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {h.source === 'public_holiday' ? 'státní svátek' : 'vlastní'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="text-red-600 hover:text-red-800"
                      aria-label="Smazat"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
