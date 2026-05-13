'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adjustCreditAllocation,
  allocateCreditPack,
  listCreditPacks,
  listCustomerCreditPacks,
  type AdminCreditPack,
  type AdminCustomerCreditPack,
} from '@/lib/api';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktivní', color: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'Vypršela', color: 'bg-slate-200 text-slate-700' },
  used_up: { label: 'Vyčerpaná', color: 'bg-amber-100 text-amber-800' },
  refunded: { label: 'Vrácena', color: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Zrušena', color: 'bg-red-100 text-red-700' },
};

export function CustomerCreditPacks({ customerId }: { customerId: string }) {
  const [allocations, setAllocations] = useState<AdminCustomerCreditPack[]>([]);
  const [templates, setTemplates] = useState<AdminCreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllocate, setShowAllocate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [priceOverride, setPriceOverride] = useState<string>('');
  const [note, setNote] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [allocs, tpls] = await Promise.all([
        listCustomerCreditPacks(customerId),
        listCreditPacks(),
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
      const payload: Parameters<typeof allocateCreditPack>[1] = {
        creditPackId: selectedTemplate,
      };
      if (priceOverride) {
        payload.pricePaidHellers = Math.round(Number(priceOverride) * 100);
      }
      if (note) payload.note = note;
      await allocateCreditPack(customerId, payload);
      setShowAllocate(false);
      setSelectedTemplate('');
      setPriceOverride('');
      setNote('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleAdjust(alloc: AdminCustomerCreditPack) {
    const input = window.prompt(
      `Aktuálně ${alloc.creditsRemaining}/${alloc.creditsAtPurchase} kreditů. Zadej delta (+5 = přidat 5, -2 = odebrat 2):`,
    );
    if (!input) return;
    const delta = Number(input.replace(/[+\s]/g, ''));
    if (Number.isNaN(delta) || delta === 0) return;
    const reason = window.prompt('Poznámka (povinná):') ?? '';
    if (!reason.trim()) return;
    try {
      await adjustCreditAllocation(alloc.id, delta, reason);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Permanentky ({allocations.length})</h3>
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
          className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 space-y-2"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Šablona</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">— vyber šablonu —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.totalCredits} kreditů,{' '}
                  {(t.priceHellers / 100).toLocaleString('cs-CZ')} Kč)
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Cena (Kč) — override</label>
              <input
                type="number"
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
                placeholder="default = ze šablony"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Poznámka</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="např. dárek za pátou návštěvu"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded font-medium"
            >
              Prodat
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Načítám…</div>
      ) : allocations.length === 0 ? (
        <div className="text-slate-500 text-sm">Žádné permanentky.</div>
      ) : (
        <div className="space-y-2">
          {allocations.map((a) => {
            const status = STATUS_LABEL[a.status] ?? { label: a.status, color: 'bg-slate-100' };
            const percent = (a.creditsRemaining / a.creditsAtPurchase) * 100;
            return (
              <div key={a.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{a.packName ?? 'Permanentka'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Koupeno {new Date(a.purchasedAt).toLocaleDateString('cs-CZ')}
                      {a.validUntil &&
                        ` · platí do ${new Date(a.validUntil).toLocaleDateString('cs-CZ')}`}
                      {' · '}
                      {(a.pricePaidHellers / 100).toLocaleString('cs-CZ')} Kč
                    </div>
                  </div>
                  {a.status === 'active' && (
                    <button
                      onClick={() => handleAdjust(a)}
                      className="text-xs text-slate-500 hover:text-slate-900"
                      title="Manuální úprava kreditu"
                    >
                      Upravit
                    </button>
                  )}
                </div>

                <div className="mt-2">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Kreditů zbývá</span>
                    <span className="font-mono">
                      {a.creditsRemaining} / {a.creditsAtPurchase}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {a.note && <div className="text-xs text-slate-500 mt-2 italic">{a.note}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
