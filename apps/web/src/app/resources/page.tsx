'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createResource,
  deleteResource,
  getAccessToken,
  listBranches,
  listResources,
  updateResource,
  type AdminBranch,
  type AdminResource,
} from '@/lib/api';

// Stoly restaurace jsou taky zdroje, ale spravují se na půdorysu v /restaurace.
const TYPES = [
  { value: 'ems_machine', label: 'EMS přístroj' },
  { value: 'room', label: 'Místnost / sál' },
  { value: 'equipment', label: 'Vybavení' },
  { value: 'vehicle', label: 'Vozidlo' },
  { value: 'other', label: 'Jiné' },
];

interface FormState {
  id: string | null;
  name: string;
  type: string;
  branchId: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  type: 'ems_machine',
  branchId: '',
  isActive: true,
};

export default function ResourcesPage() {
  const router = useRouter();
  const [resources, setResources] = useState<AdminResource[]>([]);
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
      const [res, br] = await Promise.all([listResources(), listBranches()]);
      setResources(res.filter((r) => r.type !== 'table'));
      setBranches(br);
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

  function startNew() {
    setEditing({ ...EMPTY_FORM, branchId: branches[0]?.id ?? '' });
  }

  function startEdit(r: AdminResource) {
    setEditing({
      id: r.id,
      name: r.name,
      type: r.type,
      branchId: r.branchId,
      isActive: r.isActive,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    if (!editing.name.trim()) {
      setError('Zadej název.');
      return;
    }
    if (!editing.branchId) {
      setError('Vyber pobočku.');
      return;
    }
    try {
      if (editing.id) {
        await updateResource(editing.id, {
          name: editing.name.trim(),
          type: editing.type,
          branchId: editing.branchId,
          isActive: editing.isActive,
        });
      } else {
        await createResource({
          name: editing.name.trim(),
          type: editing.type,
          branchId: editing.branchId,
        });
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(r: AdminResource) {
    if (!confirm(`Smazat "${r.name}"? Vypsané lekce na tomto přístroji zůstanou.`)) return;
    try {
      await deleteResource(r.id);
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
            <h2 className="text-2xl font-bold">Přístroje a zdroje</h2>
            <p className="text-sm text-slate-500">
              EMS stroje, sály a vybavení. Bez přístroje nelze vypsat EMS lekci. Stoly restaurace se
              spravují na půdorysu.
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nový přístroj
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {editing && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-lg font-bold mb-4">
                {editing.id ? 'Upravit zdroj' : 'Nový zdroj'}
              </h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Název *</label>
                  <input
                    type="text"
                    placeholder="EMS přístroj #1"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Typ *</label>
                  <select
                    value={editing.type}
                    onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pobočka *</label>
                  <select
                    value={editing.branchId}
                    onChange={(e) => setEditing({ ...editing, branchId: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="">— vyber pobočku —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                {editing.id && (
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.isActive}
                      onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                    />
                    Aktivní (lze na něj vypisovat lekce)
                  </label>
                )}
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

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Název</th>
                <th className="text-left px-4 py-3 font-semibold">Typ</th>
                <th className="text-left px-4 py-3 font-semibold">Pobočka</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    Načítám…
                  </td>
                </tr>
              )}
              {!loading && resources.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    Žádné přístroje. Pro EMS vytvoř první stroj.
                  </td>
                </tr>
              )}
              {resources.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {TYPES.find((t) => t.value === r.type)?.label ?? r.type}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {branches.find((b) => b.id === r.branchId)?.name ?? '—'}
                  </td>
                  <td className="text-center px-4 py-3 text-xs">
                    {r.isActive ? (
                      <span className="text-green-700">✓ aktivní</span>
                    ) : (
                      <span className="text-slate-400">× neaktivní</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => startEdit(r)}
                      className="text-brand-600 hover:underline text-sm mr-3"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
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
