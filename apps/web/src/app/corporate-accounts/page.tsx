'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createCorporateAccount,
  deleteCorporateAccount,
  getAccessToken,
  listCorporateAccounts,
  updateCorporateAccount,
  type AdminCorporateAccount,
} from '@/lib/api';

interface FormState {
  id: string | null;
  companyName: string;
  vatId: string;
  companyRegId: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingZip: string;
  billingCountry: string;
  contactEmail: string;
  contactPhone: string;
  contactPersonName: string;
  note: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  companyName: '',
  vatId: '',
  companyRegId: '',
  billingAddressLine1: '',
  billingAddressLine2: '',
  billingCity: '',
  billingZip: '',
  billingCountry: 'CZ',
  contactEmail: '',
  contactPhone: '',
  contactPersonName: '',
  note: '',
  isActive: true,
};

export default function CorporateAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AdminCorporateAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCorporateAccounts();
      setAccounts(data);
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

  function startCreate() {
    setEditing({ ...EMPTY_FORM });
  }

  function startEdit(a: AdminCorporateAccount) {
    setEditing({
      id: a.id,
      companyName: a.companyName,
      vatId: a.vatId ?? '',
      companyRegId: a.companyRegId ?? '',
      billingAddressLine1: a.billingAddressLine1 ?? '',
      billingAddressLine2: a.billingAddressLine2 ?? '',
      billingCity: a.billingCity ?? '',
      billingZip: a.billingZip ?? '',
      billingCountry: a.billingCountry ?? 'CZ',
      contactEmail: a.contactEmail ?? '',
      contactPhone: a.contactPhone ?? '',
      contactPersonName: a.contactPersonName ?? '',
      note: a.note ?? '',
      isActive: a.isActive,
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    const input = {
      companyName: editing.companyName.trim(),
      vatId: editing.vatId.trim() || null,
      companyRegId: editing.companyRegId.trim() || null,
      billingAddressLine1: editing.billingAddressLine1.trim() || null,
      billingAddressLine2: editing.billingAddressLine2.trim() || null,
      billingCity: editing.billingCity.trim() || null,
      billingZip: editing.billingZip.trim() || null,
      billingCountry: editing.billingCountry,
      contactEmail: editing.contactEmail.trim() || null,
      contactPhone: editing.contactPhone.trim() || null,
      contactPersonName: editing.contactPersonName.trim() || null,
      note: editing.note.trim() || null,
      isActive: editing.isActive,
    };
    try {
      if (editing.id) {
        await updateCorporateAccount(editing.id, input);
      } else {
        await createCorporateAccount(input);
      }
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba pri ukládání');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Opravdu smazat firmu? Akce je nevratná.')) return;
    try {
      await deleteCorporateAccount(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba pri mazání');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Firmy (B2B účty)</h2>
          <button
            onClick={startCreate}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium"
          >
            Přidat firmu
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-500">Načítám...</p>
        ) : accounts.length === 0 ? (
          <p className="text-slate-500">Žádné firmy. Přidej první.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-4 py-2">Firma</th>
                  <th className="px-4 py-2">DIČ / IČO</th>
                  <th className="px-4 py-2">Kontakt</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <Link
                        href={`/corporate-accounts/${a.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {a.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.vatId && <div>DIČ: {a.vatId}</div>}
                      {a.companyRegId && <div>IČO: {a.companyRegId}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.contactPersonName && <div>{a.contactPersonName}</div>}
                      {a.contactEmail && <div className="text-xs">{a.contactEmail}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          a.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {a.isActive ? 'aktivní' : 'neaktivní'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(a)}
                        className="text-brand-600 hover:underline text-sm mr-3"
                      >
                        Upravit
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
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
        )}

        {editing && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
            <form
              onSubmit={handleSave}
              className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-4">
                {editing.id ? 'Upravit firmu' : 'Nová firma'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Název firmy *</label>
                  <input
                    type="text"
                    required
                    value={editing.companyName}
                    onChange={(e) => setEditing({ ...editing, companyName: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">DIČ</label>
                  <input
                    type="text"
                    placeholder="CZ12345678"
                    value={editing.vatId}
                    onChange={(e) => setEditing({ ...editing, vatId: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">IČO</label>
                  <input
                    type="text"
                    placeholder="12345678"
                    value={editing.companyRegId}
                    onChange={(e) => setEditing({ ...editing, companyRegId: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Adresa</label>
                  <input
                    type="text"
                    placeholder="Náměstí 1"
                    value={editing.billingAddressLine1}
                    onChange={(e) =>
                      setEditing({ ...editing, billingAddressLine1: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Město</label>
                  <input
                    type="text"
                    value={editing.billingCity}
                    onChange={(e) => setEditing({ ...editing, billingCity: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">PSČ</label>
                  <input
                    type="text"
                    value={editing.billingZip}
                    onChange={(e) => setEditing({ ...editing, billingZip: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Kontaktní osoba</label>
                  <input
                    type="text"
                    value={editing.contactPersonName}
                    onChange={(e) => setEditing({ ...editing, contactPersonName: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={editing.contactEmail}
                    onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefon</label>
                  <input
                    type="text"
                    value={editing.contactPhone}
                    onChange={(e) => setEditing({ ...editing, contactPhone: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Poznámka</label>
                  <textarea
                    rows={2}
                    value={editing.note}
                    onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editing.isActive}
                      onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                    />
                    <span className="text-sm">Aktivní</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  Uložit
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
