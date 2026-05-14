'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getAccessToken,
  listServices,
  listSubscriptionPlans,
  updateSubscriptionPlan,
  type AdminService,
  type AdminSubscriptionPlan,
  type SubscriptionBenefits,
} from '@/lib/api';

interface FormState {
  id: string | null;
  name: string;
  description: string;
  billingInterval: 'monthly' | 'quarterly' | 'yearly';
  priceHellers: number;
  trialDays: number;
  discountPercent: number | null;
  priorityAccess: boolean;
  freeCreditsPerPeriod: number | null;
  exclusiveServiceIds: string[];
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  billingInterval: 'monthly',
  priceHellers: 49900,
  trialDays: 0,
  discountPercent: null,
  priorityAccess: false,
  freeCreditsPerPeriod: null,
  exclusiveServiceIds: [],
  isActive: true,
};

const INTERVAL_LABEL: Record<string, string> = {
  monthly: 'měsíčně',
  quarterly: 'čtvrtletně',
  yearly: 'ročně',
};

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

export default function SubscriptionPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<AdminSubscriptionPlan[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([listSubscriptionPlans(), listServices()]);
      setPlans(p);
      setServices(s);
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

  function startNew() {
    setEditing({ ...EMPTY_FORM });
  }

  function startEdit(p: AdminSubscriptionPlan) {
    setEditing({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      billingInterval: p.billingInterval,
      priceHellers: p.priceHellers,
      trialDays: p.trialDays,
      discountPercent: p.benefits.discountPercent ?? null,
      priorityAccess: p.benefits.priorityAccess ?? false,
      freeCreditsPerPeriod: p.benefits.freeCreditsPerPeriod ?? null,
      exclusiveServiceIds: p.benefits.exclusiveServiceIds ?? [],
      isActive: p.isActive,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    const benefits: SubscriptionBenefits = {};
    if (editing.discountPercent !== null) benefits.discountPercent = editing.discountPercent;
    if (editing.priorityAccess) benefits.priorityAccess = true;
    if (editing.freeCreditsPerPeriod !== null)
      benefits.freeCreditsPerPeriod = editing.freeCreditsPerPeriod;
    if (editing.exclusiveServiceIds.length > 0)
      benefits.exclusiveServiceIds = editing.exclusiveServiceIds;

    try {
      const payload = {
        name: editing.name,
        description: editing.description || null,
        billingInterval: editing.billingInterval,
        priceHellers: editing.priceHellers,
        trialDays: editing.trialDays,
        benefits,
        isActive: editing.isActive,
      };
      if (editing.id) {
        await updateSubscriptionPlan(editing.id, payload);
      } else {
        await createSubscriptionPlan(payload);
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(p: AdminSubscriptionPlan) {
    if (!confirm(`Smazat plán "${p.name}"? Existující předplatné zůstane.`)) return;
    try {
      await deleteSubscriptionPlan(p.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Předplatné</h2>
            <p className="text-sm text-slate-500">
              Recurring billing přes Stripe. Příklad: „VIP členství 499 Kč/měsíc" = 20% sleva na vše
              + prioritní rezervace + 1 masáž zdarma.
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nový plán
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {editing && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">
                {editing.id ? 'Upravit plán' : 'Nový plán'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Název *</label>
                  <input
                    type="text"
                    required
                    placeholder="VIP členství, Gold, Premium..."
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Popis</label>
                  <textarea
                    rows={2}
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Cena (Kč) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editing.priceHellers / 100}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        priceHellers: Math.round(Number(e.target.value) * 100),
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Frekvence *</label>
                  <select
                    value={editing.billingInterval}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        billingInterval: e.target.value as 'monthly' | 'quarterly' | 'yearly',
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="monthly">Měsíčně</option>
                    <option value="quarterly">Čtvrtletně</option>
                    <option value="yearly">Ročně</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Trial (dní zdarma)</label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={editing.trialDays}
                    onChange={(e) =>
                      setEditing({ ...editing, trialDays: Number(e.target.value) || 0 })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>

                {/* Benefits section */}
                <div className="md:col-span-2 mt-2 border-t border-slate-100 pt-3">
                  <h4 className="font-semibold mb-2">Výhody předplatitelů</h4>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Sleva % na všechny služby — prázdné = bez slevy
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editing.discountPercent ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        discountPercent: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Free kreditů za období — prázdné = žádné
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editing.freeCreditsPerPeriod ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        freeCreditsPerPeriod: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.priorityAccess}
                      onChange={(e) => setEditing({ ...editing, priorityAccess: e.target.checked })}
                    />
                    Prioritní přístup ke slotům
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Exkluzivní služby (jen pro předplatitele)
                  </label>
                  <div className="border border-slate-300 rounded p-2 max-h-32 overflow-y-auto">
                    {services.length === 0 ? (
                      <p className="text-sm text-slate-500">Žádné služby.</p>
                    ) : (
                      services.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 py-1 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={editing.exclusiveServiceIds.includes(s.id)}
                            onChange={(e) => {
                              setEditing({
                                ...editing,
                                exclusiveServiceIds: e.target.checked
                                  ? [...editing.exclusiveServiceIds, s.id]
                                  : editing.exclusiveServiceIds.filter((id) => id !== s.id),
                              });
                            }}
                          />
                          {s.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.isActive}
                      onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                    />
                    Aktivní (lze prodávat)
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  Uložit
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Plán</th>
                <th className="text-center px-4 py-3 font-semibold">Cena / frekvence</th>
                <th className="text-center px-4 py-3 font-semibold">Trial</th>
                <th className="text-left px-4 py-3 font-semibold">Výhody</th>
                <th className="text-center px-4 py-3 font-semibold">Aktivní</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && plans.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Žádné plány předplatného. Vytvoř první.
                  </td>
                </tr>
              )}
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                  </td>
                  <td className="text-center px-4 py-3">
                    <div className="font-medium">{formatPrice(p.priceHellers)}</div>
                    <div className="text-xs text-slate-500">
                      {INTERVAL_LABEL[p.billingInterval]}
                    </div>
                  </td>
                  <td className="text-center px-4 py-3 text-slate-600">
                    {p.trialDays > 0 ? `${p.trialDays} dní` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {p.benefits.discountPercent && <div>Sleva {p.benefits.discountPercent}%</div>}
                    {p.benefits.freeCreditsPerPeriod && (
                      <div>{p.benefits.freeCreditsPerPeriod} free kreditů</div>
                    )}
                    {p.benefits.priorityAccess && <div>Priority access</div>}
                    {(p.benefits.exclusiveServiceIds?.length ?? 0) > 0 && (
                      <div>{p.benefits.exclusiveServiceIds?.length} exkluzivních služeb</div>
                    )}
                  </td>
                  <td className="text-center px-4 py-3">
                    {p.isActive ? (
                      <span className="text-green-700">✓</span>
                    ) : (
                      <span className="text-slate-400">×</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => startEdit(p)}
                      className="text-brand-600 hover:underline text-sm mr-3"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Smazat
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
