'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createEmployee,
  deleteEmployee,
  getAccessToken,
  listEmployeesFull,
  updateEmployee,
  type AdminEmployeeFull,
} from '@/lib/api';

interface FormState {
  id: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  title: string;
  bio: string;
  color: string;
  isPublic: boolean;
  acceptsOnlineBookings: boolean;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  firstName: '',
  lastName: '',
  displayName: '',
  email: '',
  phone: '',
  title: '',
  bio: '',
  color: '#10b981',
  isPublic: true,
  acceptsOnlineBookings: true,
  sortOrder: 0,
  isActive: true,
};

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<AdminEmployeeFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEmployeesFull();
      setEmployees(data);
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

  function startEdit(e: AdminEmployeeFull) {
    setEditing({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      displayName: e.displayName ?? '',
      email: e.email ?? '',
      phone: e.phone ?? '',
      title: e.title ?? '',
      bio: e.bio ?? '',
      color: e.color ?? '#10b981',
      isPublic: e.isPublic,
      acceptsOnlineBookings: e.acceptsOnlineBookings,
      sortOrder: e.sortOrder,
      isActive: e.isActive,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    try {
      const payload = {
        firstName: editing.firstName,
        lastName: editing.lastName,
        displayName: editing.displayName || null,
        email: editing.email || null,
        phone: editing.phone || null,
        title: editing.title || null,
        bio: editing.bio || null,
        color: editing.color || null,
        isPublic: editing.isPublic,
        acceptsOnlineBookings: editing.acceptsOnlineBookings,
        sortOrder: editing.sortOrder,
      };
      if (editing.id) {
        await updateEmployee(editing.id, { ...payload, isActive: editing.isActive });
      } else {
        await createEmployee(payload);
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(e: AdminEmployeeFull) {
    if (
      !confirm(`Smazat zaměstnance "${e.firstName} ${e.lastName}"? Existující rezervace zůstanou.`)
    )
      return;
    try {
      await deleteEmployee(e.id);
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
            <h2 className="text-2xl font-bold">Zaměstnanci</h2>
            <p className="text-sm text-slate-500">
              Lidé v týmu. Rezervace se přiřazují konkrétnímu zaměstnanci. Bez zaměstnance se nedá
              nic nabookovat.
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nový zaměstnanec
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
                {editing.id ? 'Upravit zaměstnance' : 'Nový zaměstnanec'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Jméno *</label>
                  <input
                    type="text"
                    required
                    value={editing.firstName}
                    onChange={(e) => setEditing({ ...editing, firstName: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Příjmení *</label>
                  <input
                    type="text"
                    required
                    value={editing.lastName}
                    onChange={(e) => setEditing({ ...editing, lastName: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Zobrazované jméno (volitelné — přepíše Jméno+Příjmení)
                  </label>
                  <input
                    type="text"
                    placeholder="Např. Pavla / Dr. Novák"
                    value={editing.displayName}
                    onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pozice / titul</label>
                  <input
                    type="text"
                    placeholder="Kadeřnice, Masér, ..."
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={editing.email}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefon</label>
                  <input
                    type="text"
                    value={editing.phone}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
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
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Bio / popis</label>
                  <textarea
                    rows={2}
                    placeholder="Krátký text pro zákazníky..."
                    value={editing.bio}
                    onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
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
                    Veřejný (zobrazit ve widgetu)
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.acceptsOnlineBookings}
                      onChange={(e) =>
                        setEditing({ ...editing, acceptsOnlineBookings: e.target.checked })
                      }
                    />
                    Přijímá online rezervace
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
                <th className="text-left px-4 py-3 font-semibold">Jméno</th>
                <th className="text-left px-4 py-3 font-semibold">Kontakt</th>
                <th className="text-left px-4 py-3 font-semibold">Pozice</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && employees.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    Žádní zaměstnanci. Přidej první.
                  </td>
                </tr>
              )}
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {emp.color && (
                        <span
                          className="inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: emp.color }}
                        />
                      )}
                      <div>
                        <div className="font-medium">
                          {emp.displayName ?? `${emp.firstName} ${emp.lastName}`}
                        </div>
                        {emp.bio && (
                          <div className="text-xs text-slate-500 line-clamp-1">{emp.bio}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {emp.email && <div>{emp.email}</div>}
                    {emp.phone && <div>{emp.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{emp.title ?? '—'}</td>
                  <td className="text-center px-4 py-3 text-xs">
                    {emp.isActive ? (
                      <span className="text-green-700">✓ aktivní</span>
                    ) : (
                      <span className="text-slate-400">× neaktivní</span>
                    )}
                    {!emp.acceptsOnlineBookings && (
                      <div className="text-amber-600">offline only</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => startEdit(emp)}
                      className="text-brand-600 hover:underline text-sm mr-3"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={() => handleDelete(emp)}
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
