'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  allocateTimePack,
  listCustomerTimePacks,
  listTimePacks,
  type AdminCustomerTimePack,
  type AdminTimePack,
} from '@/lib/api';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktivní', color: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'Vypršela', color: 'bg-slate-200 text-slate-700' },
  used_up: { label: 'Vyčerpaná', color: 'bg-amber-100 text-amber-800' },
  refunded: { label: 'Vrácena', color: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Zrušena', color: 'bg-red-100 text-red-700' },
};

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

export function CustomerTimePacks({ customerId }: { customerId: string }) {
  const [allocations, setAllocations] = useState<AdminCustomerTimePack[]>([]);
  const [templates, setTemplates] = useState<AdminTimePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllocate, setShowAllocate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [priceOverride, setPriceOverride] = useState('');
  const [note, setNote] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [allocs, tpls] = await Promise.all([
        listCustomerTimePacks(customerId),
        listTimePacks(),
      ]);
      setAllocations(allocs);
      setTemplates(tpls.filter((t) => t.isActive));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleAllocate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) return;
    setError(null);
    try {
      const payload: Parameters<typeof allocateTimePack>[1] = {
        timePackId: selectedTemplate,
      };
      if (priceOverride) {
        payload.pricePaidHellers = Math.round(Number(priceOverride) * 100);
      }
      if (note) payload.note = note;
      await allocateTimePack(customerId, payload);
      setShowAllocate(false);
      setSelectedTemplate('');
      setPriceOverride('');
      setNote('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Časové balíčky ({allocations.length})</h3>
        <button
          onClick={() => setShowAllocate(!showAllocate)}
          className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded font-medium"
        >
          {showAllocate ? 'Zavřít' : '+ Prodat / přidělit'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-2 rounded mb-3">
          {error}
        </div>
      )}

      {showAllocate && (
        <form
          onSubmit={handleAllocate}
          className="border border-slate-200 rounded p-3 mb-3 space-y-2"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Šablona</label>
            <select
              required
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            >
              <option value="">— vyber —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({formatPrice(t.priceHellers)} / {t.durationDays} dní)
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">
                Cena (Kč) — prázdné = default
              </label>
              <input
                type="number"
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Poznámka</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!selectedTemplate}
            className="bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded text-sm font-medium"
          >
            Prodat
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Načítám...</p>
      ) : allocations.length === 0 ? (
        <p className="text-sm text-slate-500">Žádné časové balíčky.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-600 border-b border-slate-100">
            <tr>
              <th className="text-left py-2">Balíček</th>
              <th className="text-left py-2">Využití</th>
              <th className="text-left py-2">Platnost do</th>
              <th className="text-left py-2">Cena</th>
              <th className="text-left py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => {
              const status = STATUS_LABEL[a.status] ?? { label: a.status, color: 'bg-slate-100' };
              const limitTotal = a.snapshotMaxBookingsPerPeriod;
              return (
                <tr key={a.id} className="border-b border-slate-50">
                  <td className="py-2">
                    <div className="font-medium">{a.packName ?? '—'}</div>
                    {a.note && <div className="text-xs text-slate-500">{a.note}</div>}
                  </td>
                  <td className="py-2 text-slate-600 text-xs">
                    {a.bookingsUsed} / {limitTotal ?? '∞'}
                    {a.snapshotMaxBookingsPerDay && <div>{a.snapshotMaxBookingsPerDay}/den</div>}
                  </td>
                  <td className="py-2 text-slate-600 text-xs">
                    {new Date(a.validUntil).toLocaleDateString('cs-CZ')}
                  </td>
                  <td className="py-2 text-slate-600">{formatPrice(a.pricePaidHellers)}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
