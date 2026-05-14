'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createBundlePack,
  deleteBundlePack,
  getAccessToken,
  listBranches,
  listBundlePacks,
  listServices,
  updateBundlePack,
  type AdminBranch,
  type AdminBundlePack,
  type AdminService,
  type BundleItem,
} from '@/lib/api';

interface FormState {
  id: string | null;
  name: string;
  description: string;
  items: BundleItem[];
  validityDays: number | null;
  priceHellers: number;
  allowedBranchIds: string[];
  sameVisitRequired: boolean;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  items: [],
  validityDays: 180,
  priceHellers: 220000,
  allowedBranchIds: [],
  sameVisitRequired: false,
  isActive: true,
};

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

export default function BundlePacksPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<AdminBundlePack[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, b] = await Promise.all([listBundlePacks(), listServices(), listBranches()]);
      setPacks(p);
      setServices(s);
      setBranches(b);
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
    setEditing({ ...EMPTY_FORM, items: [] });
  }

  function startEdit(p: AdminBundlePack) {
    setEditing({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      items: [...p.items],
      validityDays: p.validityDays,
      priceHellers: p.priceHellers,
      allowedBranchIds: p.allowedBranchIds,
      sameVisitRequired: p.sameVisitRequired,
      isActive: p.isActive,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    if (editing.items.length === 0) {
      setError('Bundle musí obsahovat alespoň jednu službu.');
      return;
    }
    try {
      const payload = {
        name: editing.name,
        description: editing.description || null,
        items: editing.items,
        validityDays: editing.validityDays,
        priceHellers: editing.priceHellers,
        allowedBranchIds: editing.allowedBranchIds,
        sameVisitRequired: editing.sameVisitRequired,
        isActive: editing.isActive,
      };
      if (editing.id) {
        await updateBundlePack(editing.id, payload);
      } else {
        await createBundlePack(payload);
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(p: AdminBundlePack) {
    if (!confirm(`Smazat bundle "${p.name}"? Existující prodané balíčky zůstanou.`)) return;
    try {
      await deleteBundlePack(p.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  function addItem() {
    if (!editing || services.length === 0) return;
    const firstService = services[0];
    if (!firstService) return;
    setEditing({
      ...editing,
      items: [...editing.items, { serviceId: firstService.id, quantity: 1 }],
    });
  }

  function updateItem(idx: number, patch: Partial<BundleItem>) {
    if (!editing) return;
    const items = [...editing.items];
    const current = items[idx];
    if (!current) return;
    items[idx] = { serviceId: current.serviceId, quantity: current.quantity, ...patch };
    setEditing({ ...editing, items });
  }

  function removeItem(idx: number) {
    if (!editing) return;
    setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Bundle balíčky</h2>
            <p className="text-sm text-slate-500">
              Svazek konkrétních služeb v jedné ceně. Příklad: „Relaxační balíček" = masáž 60min +
              manikúra + zábal za 2200 Kč.
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nový bundle
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
                {editing.id ? 'Upravit bundle' : 'Nový bundle'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Název *</label>
                  <input
                    type="text"
                    required
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
                    min="0"
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
                  <label className="block text-sm font-medium mb-1">
                    Platnost (dní) — prázdné = bez expirace
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editing.validityDays ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        validityDays: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>

                {/* Items list */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Položky balíčku *</label>
                    <button
                      type="button"
                      onClick={addItem}
                      className="text-sm text-brand-600 hover:underline"
                    >
                      + Přidat položku
                    </button>
                  </div>
                  {editing.items.length === 0 ? (
                    <p className="text-sm text-slate-500 border border-dashed border-slate-300 rounded p-3 text-center">
                      Bundle musí mít alespoň jednu službu. Klikni „Přidat položku".
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editing.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={item.serviceId}
                            onChange={(e) => updateItem(idx, { serviceId: e.target.value })}
                            className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm"
                          >
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(idx, { quantity: Number(e.target.value) || 1 })
                            }
                            className="w-20 border border-slate-300 rounded px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-red-600 hover:text-red-800 text-sm px-2"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Branch restrictions */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Omezit na pobočky — prázdné = všechny
                  </label>
                  <div className="border border-slate-300 rounded p-2 max-h-32 overflow-y-auto">
                    {branches.length === 0 ? (
                      <p className="text-sm text-slate-500">Žádné pobočky.</p>
                    ) : (
                      branches.map((b) => (
                        <label
                          key={b.id}
                          className="flex items-center gap-2 py-1 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={editing.allowedBranchIds.includes(b.id)}
                            onChange={(e) => {
                              setEditing({
                                ...editing,
                                allowedBranchIds: e.target.checked
                                  ? [...editing.allowedBranchIds, b.id]
                                  : editing.allowedBranchIds.filter((id) => id !== b.id),
                              });
                            }}
                          />
                          {b.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.sameVisitRequired}
                      onChange={(e) =>
                        setEditing({ ...editing, sameVisitRequired: e.target.checked })
                      }
                    />
                    Vše musí být v jedné návštěvě
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.isActive}
                      onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                    />
                    Aktivní
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
                <th className="text-left px-4 py-3 font-semibold">Název</th>
                <th className="text-left px-4 py-3 font-semibold">Položky</th>
                <th className="text-center px-4 py-3 font-semibold">Platnost</th>
                <th className="text-right px-4 py-3 font-semibold">Cena</th>
                <th className="text-center px-4 py-3 font-semibold">Aktivní</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && packs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Žádné bundle balíčky. Vytvoř první.
                  </td>
                </tr>
              )}
              {packs.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.items.map((it, i) => {
                      const svc = services.find((s) => s.id === it.serviceId);
                      return (
                        <div key={i} className="text-xs">
                          {it.quantity}× {svc?.name ?? '?'}
                        </div>
                      );
                    })}
                  </td>
                  <td className="text-center px-4 py-3 text-slate-600">
                    {p.validityDays ? `${p.validityDays} dní` : '∞'}
                  </td>
                  <td className="text-right px-4 py-3 font-medium">
                    {formatPrice(p.priceHellers)}
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
