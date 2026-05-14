'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createService,
  createServiceCategory,
  deleteService,
  getAccessToken,
  listServiceCategories,
  listServicesFull,
  updateService,
  type AdminServiceCategory,
  type AdminServiceFull,
} from '@/lib/api';

interface FormState {
  id: string | null;
  name: string;
  description: string;
  categoryId: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceHellers: number;
  color: string;
  isPublic: boolean;
  capacity: number;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  categoryId: '',
  durationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  priceHellers: 50000,
  color: '#3b82f6',
  isPublic: true,
  capacity: 1,
  sortOrder: 0,
  isActive: true,
};

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

export default function ServicesPage() {
  const router = useRouter();
  const [services, setServices] = useState<AdminServiceFull[]>([]);
  const [categories, setCategories] = useState<AdminServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([listServicesFull(), listServiceCategories()]);
      setServices(s);
      setCategories(c);
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

  function startEdit(s: AdminServiceFull) {
    setEditing({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      categoryId: s.categoryId ?? '',
      durationMinutes: s.durationMinutes,
      bufferBeforeMinutes: s.bufferBeforeMinutes,
      bufferAfterMinutes: s.bufferAfterMinutes,
      priceHellers: s.priceHellers,
      color: s.color ?? '#3b82f6',
      isPublic: s.isPublic,
      capacity: s.capacity,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    try {
      const payload = {
        name: editing.name,
        description: editing.description || null,
        categoryId: editing.categoryId || null,
        durationMinutes: editing.durationMinutes,
        bufferBeforeMinutes: editing.bufferBeforeMinutes,
        bufferAfterMinutes: editing.bufferAfterMinutes,
        priceHellers: editing.priceHellers,
        color: editing.color || null,
        isPublic: editing.isPublic,
        capacity: editing.capacity,
        sortOrder: editing.sortOrder,
      };
      if (editing.id) {
        await updateService(editing.id, { ...payload, isActive: editing.isActive });
      } else {
        await createService(payload);
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(s: AdminServiceFull) {
    if (!confirm(`Smazat službu "${s.name}"? Existující rezervace zůstanou.`)) return;
    try {
      await deleteService(s.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    try {
      const created = await createServiceCategory({ name: newCategoryName.trim() });
      setNewCategoryName('');
      setShowNewCategory(false);
      await reload();
      if (editing) setEditing({ ...editing, categoryId: created.id });
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
            <h2 className="text-2xl font-bold">Služby</h2>
            <p className="text-sm text-slate-500">
              Co všechno tvůj salon nabízí. Cena, délka, kategorie. Bez nich není rezervační flow.
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nová služba
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
                {editing.id ? 'Upravit službu' : 'Nová služba'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Název *</label>
                  <input
                    type="text"
                    required
                    placeholder="Střih, Masáž 60min, ..."
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
                  <label className="block text-sm font-medium mb-1">Délka (minut) *</label>
                  <input
                    type="number"
                    required
                    min="5"
                    max="1440"
                    value={editing.durationMinutes}
                    onChange={(e) =>
                      setEditing({ ...editing, durationMinutes: Number(e.target.value) || 60 })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Buffer před (min)</label>
                  <input
                    type="number"
                    min="0"
                    max="240"
                    value={editing.bufferBeforeMinutes}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        bufferBeforeMinutes: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Buffer po (min)</label>
                  <input
                    type="number"
                    min="0"
                    max="240"
                    value={editing.bufferAfterMinutes}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        bufferAfterMinutes: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Kategorie</label>
                  <div className="flex gap-2">
                    <select
                      value={editing.categoryId}
                      onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}
                      className="flex-1 border border-slate-300 rounded px-3 py-2"
                    >
                      <option value="">— bez kategorie —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {!showNewCategory ? (
                      <button
                        type="button"
                        onClick={() => setShowNewCategory(true)}
                        className="text-sm text-brand-600 hover:underline"
                      >
                        + Nová
                      </button>
                    ) : (
                      <>
                        <input
                          type="text"
                          placeholder="Název"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          className="border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleCreateCategory}
                          className="text-sm bg-brand-600 text-white px-2 py-1 rounded"
                        >
                          OK
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Barva v kalendáři</label>
                  <input
                    type="color"
                    value={editing.color}
                    onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                    className="w-full border border-slate-300 rounded px-1 py-1 h-10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Kapacita (skupinová)</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={editing.capacity}
                    onChange={(e) =>
                      setEditing({ ...editing, capacity: Number(e.target.value) || 1 })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.isPublic}
                      onChange={(e) => setEditing({ ...editing, isPublic: e.target.checked })}
                    />
                    Veřejná (zobrazit ve widgetu)
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
                <th className="text-left px-4 py-3 font-semibold">Služba</th>
                <th className="text-left px-4 py-3 font-semibold">Kategorie</th>
                <th className="text-center px-4 py-3 font-semibold">Délka</th>
                <th className="text-right px-4 py-3 font-semibold">Cena</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && services.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Žádné služby. Vytvoř první (např. „Střih dámský 60 min za 500 Kč").
                  </td>
                </tr>
              )}
              {services.map((s) => {
                const cat = categories.find((c) => c.id === s.categoryId);
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {s.color && (
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                        )}
                        <div>
                          <div className="font-medium">{s.name}</div>
                          {s.description && (
                            <div className="text-xs text-slate-500">{s.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{cat?.name ?? '—'}</td>
                    <td className="text-center px-4 py-3">{s.durationMinutes} min</td>
                    <td className="text-right px-4 py-3 font-medium">
                      {formatPrice(s.priceHellers)}
                    </td>
                    <td className="text-center px-4 py-3 text-xs">
                      {s.isActive ? (
                        <span className="text-green-700">✓ aktivní</span>
                      ) : (
                        <span className="text-slate-400">× neaktivní</span>
                      )}
                      {!s.isPublic && <div className="text-amber-600">jen interně</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(s)}
                        className="text-brand-600 hover:underline text-sm mr-3"
                      >
                        Upravit
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Smazat
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
