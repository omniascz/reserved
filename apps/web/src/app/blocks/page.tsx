'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createBlock,
  deleteBlock,
  getAccessToken,
  listBlocks,
  type AdminBlock,
} from '@/lib/api';

const BLOCK_TYPE_LABELS: Record<string, string> = {
  cleaning: 'Úklid',
  training: 'Školení',
  meeting: 'Schůzka',
  maintenance: 'Údržba',
  other: 'Jiné',
};

export default function BlocksPage() {
  const router = useRouter();
  const [blocks, setBlocks] = useState<AdminBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    startTime: '12:00',
    endTime: '13:00',
    blockType: 'cleaning',
    title: '',
    note: '',
  });

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Načti od dnes do +90 dní
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const data = await listBlocks(today, future);
      setBlocks(data);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const startsAt = new Date(`${formData.date}T${formData.startTime}:00`).toISOString();
      const endsAt = new Date(`${formData.date}T${formData.endTime}:00`).toISOString();
      await createBlock({
        startsAt,
        endsAt,
        blockType: formData.blockType,
        title: formData.title || undefined,
        note: formData.note || undefined,
      });
      setShowForm(false);
      setFormData({ ...formData, title: '', note: '' });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Smazat tuto blokaci?')) return;
    try {
      await deleteBlock(id);
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
            <h2 className="text-2xl font-bold">Blokace času</h2>
            <p className="text-sm text-slate-500">
              Když v salonu probíhá úklid, školení nebo interní schůzka, zablokuj čas a zákazníci ho
              neuvidí ve widgetu.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            {showForm ? 'Zavřít' : '+ Nová blokace'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 grid sm:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">Datum</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Typ</label>
              <select
                value={formData.blockType}
                onChange={(e) => setFormData({ ...formData, blockType: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                {Object.entries(BLOCK_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Od</label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Do</label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Název (volitelně)</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Generální úklid"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Poznámka</label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-medium"
              >
                Zrušit
              </button>
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium"
              >
                Vytvořit blokaci
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Začátek</th>
                <th className="text-left px-4 py-3 font-semibold">Konec</th>
                <th className="text-left px-4 py-3 font-semibold">Typ</th>
                <th className="text-left px-4 py-3 font-semibold">Název</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && blocks.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    Žádné blokace v následujících 90 dnech.
                  </td>
                </tr>
              )}
              {blocks.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {new Date(b.startsAt).toLocaleString('cs-CZ', {
                      timeZone: 'Europe/Prague',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(b.endsAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}
                  </td>
                  <td className="px-4 py-3">{BLOCK_TYPE_LABELS[b.blockType] ?? b.blockType}</td>
                  <td className="px-4 py-3 text-slate-600">{b.title ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(b.id)}
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
