'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  listCustomers,
  listCustomerTags,
  type AdminCustomer,
} from '@/lib/api';

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [tags, setTags] = useState<Array<{ tag: string; color: string | null; count: number }>>([]);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, tagList] = await Promise.all([
        listCustomers({ search, tag: selectedTag ?? undefined }),
        listCustomerTags(),
      ]);
      setCustomers(list);
      setTags(tagList);
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
  }, [search, selectedTag, router]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Zákazníci</h2>
            <p className="text-sm text-slate-500">
              {loading ? 'Načítám…' : `${customers.length} záznamů`}
            </p>
          </div>
          <input
            type="search"
            placeholder="Hledat — jméno, email, telefon…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1 rounded-full text-xs ${
                !selectedTag
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-300 hover:bg-slate-100'
              }`}
            >
              Všichni
            </button>
            {tags.map((t) => (
              <button
                key={t.tag}
                onClick={() => setSelectedTag(t.tag)}
                className={`px-3 py-1 rounded-full text-xs flex items-center gap-1.5 ${
                  selectedTag === t.tag
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-300 hover:bg-slate-100'
                }`}
              >
                {t.color && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                    aria-hidden="true"
                  />
                )}
                {t.tag} <span className="text-slate-400">({t.count})</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Jméno</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Telefon</th>
                <th className="text-left px-4 py-3 font-semibold">Typ</th>
                <th className="text-left px-4 py-3 font-semibold">Přidán</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    Žádní zákazníci. Po první rezervaci se zde objeví automaticky.
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.email}</td>
                  <td className="px-4 py-3 text-slate-600">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.customerType === 'vip'
                          ? 'bg-amber-100 text-amber-800'
                          : c.customerType === 'corporate'
                            ? 'bg-blue-100 text-blue-800'
                            : c.customerType === 'risky'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {c.customerType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString('cs-CZ')}
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
