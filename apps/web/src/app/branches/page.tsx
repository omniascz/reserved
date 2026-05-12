'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createBranch,
  deleteBranch,
  getAccessToken,
  listBranches,
  updateBranch,
  type AdminBranch,
} from '@/lib/api';

const EMPTY_FORM = {
  id: '',
  name: '',
  slug: '',
  address: '',
  city: '',
  postalCode: '',
  phone: '',
  email: '',
};

export default function BranchesPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<typeof EMPTY_FORM | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setBranches(await listBranches());
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

  function startEdit(b: AdminBranch) {
    setEditing({
      id: b.id,
      name: b.name,
      slug: b.slug,
      address: b.address ?? '',
      city: b.city ?? '',
      postalCode: b.postalCode ?? '',
      phone: b.phone ?? '',
      email: b.email ?? '',
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: editing.name,
        slug: editing.slug,
        address: editing.address || undefined,
        city: editing.city || undefined,
        postalCode: editing.postalCode || undefined,
        phone: editing.phone || undefined,
        email: editing.email || undefined,
      };
      if (editing.id) {
        await updateBranch(editing.id, payload);
      } else {
        await createBranch(payload);
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(b: AdminBranch) {
    if (!confirm(`Smazat pobočku "${b.name}"?`)) return;
    try {
      await deleteBranch(b.id);
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
            <h2 className="text-2xl font-bold">Pobočky</h2>
            <p className="text-sm text-slate-500">
              Místa, kde poskytuješ služby. Zaměstnance pak přiřadíš k pobočkám v jejich detailu.
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nová pobočka
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {editing && (
          <form
            onSubmit={handleSave}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6 grid sm:grid-cols-2 gap-4"
          >
            <div className="sm:col-span-2 font-semibold">
              {editing.id ? 'Upravit pobočku' : 'Nová pobočka'}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Název *</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
                placeholder="Salon Praha — Anděl"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Slug *</label>
              <input
                type="text"
                value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase() })}
                required
                pattern="[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?"
                placeholder="andel"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">Krátký kód, malá písmena a pomlčky.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Adresa</label>
              <input
                type="text"
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                placeholder="Plzeňská 1, 150 00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Město</label>
              <input
                type="text"
                value={editing.city}
                onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">PSČ</label>
              <input
                type="text"
                value={editing.postalCode}
                onChange={(e) => setEditing({ ...editing, postalCode: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Telefon</label>
              <input
                type="tel"
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">E-mail</label>
              <input
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-medium"
              >
                Zrušit
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
              >
                {saving ? 'Ukládám…' : 'Uložit'}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Název</th>
                <th className="text-left px-4 py-3 font-semibold">Slug</th>
                <th className="text-left px-4 py-3 font-semibold">Adresa</th>
                <th className="text-left px-4 py-3 font-semibold">Telefon</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && branches.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    Žádné pobočky.
                  </td>
                </tr>
              )}
              {branches.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    {b.name}
                    {b.isDefault === 'true' && (
                      <span className="ml-2 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                        hlavní
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{b.slug}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {[b.address, b.city].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{b.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => startEdit(b)}
                      className="text-brand-600 hover:text-brand-800 text-sm mr-3"
                    >
                      Upravit
                    </button>
                    {b.isDefault !== 'true' && (
                      <button
                        onClick={() => handleDelete(b)}
                        className="text-red-600 hover:text-red-800"
                        aria-label="Smazat"
                      >
                        ×
                      </button>
                    )}
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
