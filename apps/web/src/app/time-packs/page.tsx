'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createTimePack,
  deleteTimePack,
  getAccessToken,
  listBranches,
  listServices,
  listTimePacks,
  updateTimePack,
  type AdminBranch,
  type AdminService,
  type AdminTimePack,
} from '@/lib/api';

interface FormState {
  id: string | null;
  name: string;
  description: string;
  durationDays: number;
  maxBookingsPerPeriod: number | null;
  maxBookingsPerDay: number | null;
  allowedServiceIds: string[];
  allowedBranchIds: string[];
  priceHellers: number;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  durationDays: 30,
  maxBookingsPerPeriod: null,
  maxBookingsPerDay: 1,
  allowedServiceIds: [],
  allowedBranchIds: [],
  priceHellers: 120000,
  isActive: true,
};

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

export default function TimePacksPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<AdminTimePack[]>([]);
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
      const [p, s, b] = await Promise.all([listTimePacks(), listServices(), listBranches()]);
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
    setEditing({ ...EMPTY_FORM });
  }

  function startEdit(p: AdminTimePack) {
    setEditing({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      durationDays: p.durationDays,
      maxBookingsPerPeriod: p.maxBookingsPerPeriod,
      maxBookingsPerDay: p.maxBookingsPerDay,
      allowedServiceIds: p.allowedServiceIds,
      allowedBranchIds: p.allowedBranchIds,
      priceHellers: p.priceHellers,
      isActive: p.isActive,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    try {
      const payload = {
        name: editing.name,
        description: editing.description || null,
        durationDays: editing.durationDays,
        maxBookingsPerPeriod: editing.maxBookingsPerPeriod,
        maxBookingsPerDay: editing.maxBookingsPerDay,
        allowedServiceIds: editing.allowedServiceIds,
        allowedBranchIds: editing.allowedBranchIds,
        priceHellers: editing.priceHellers,
        isActive: editing.isActive,
      };
      if (editing.id) {
        await updateTimePack(editing.id, payload);
      } else {
        await createTimePack(payload);
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(p: AdminTimePack) {
    if (!confirm(`Smazat časový balíček "${p.name}"? Existující prodané zůstanou.`)) return;
    try {
      await deleteTimePack(p.id);
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
            <h2 className="text-2xl font-bold">Časové balíčky</h2>
            <p className="text-sm text-slate-500">
              Předplatné bez auto-renewal. Příklad: „Neomezené fitness lekce po dobu 30 dní za 1200
              Kč" nebo „1 lekce denně, max 10 za měsíc".
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nový časový balíček
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
                {editing.id ? 'Upravit časový balíček' : 'Nový časový balíček'}
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
                  <label className="block text-sm font-medium mb-1">Platnost (dní) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editing.durationDays}
                    onChange={(e) =>
                      setEditing({ ...editing, durationDays: Number(e.target.value) || 1 })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Max rezervací celkem — prázdné = neomezeno
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editing.maxBookingsPerPeriod ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        maxBookingsPerPeriod: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Max rezervací za den — prázdné = bez limitu
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editing.maxBookingsPerDay ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        maxBookingsPerDay: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>

                {/* Services */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Omezit na služby — prázdné = všechny
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
                            checked={editing.allowedServiceIds.includes(s.id)}
                            onChange={(e) => {
                              setEditing({
                                ...editing,
                                allowedServiceIds: e.target.checked
                                  ? [...editing.allowedServiceIds, s.id]
                                  : editing.allowedServiceIds.filter((id) => id !== s.id),
                              });
                            }}
                          />
                          {s.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Branches */}
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

                <div className="md:col-span-2">
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
                <th className="text-center px-4 py-3 font-semibold">Platnost</th>
                <th className="text-center px-4 py-3 font-semibold">Limit</th>
                <th className="text-right px-4 py-3 font-semibold">Cena</th>
                <th className="text-center px-4 py-3 font-semibold">Aktivní</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && packs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Žádné časové balíčky. Vytvoř první.
                  </td>
                </tr>
              )}
              {packs.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                  </td>
                  <td className="text-center px-4 py-3">{p.durationDays} dní</td>
                  <td className="text-center px-4 py-3 text-xs text-slate-600">
                    {p.maxBookingsPerPeriod ? `${p.maxBookingsPerPeriod} celkem` : 'bez limitu'}
                    {p.maxBookingsPerDay && <div>{p.maxBookingsPerDay}/den</div>}
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
