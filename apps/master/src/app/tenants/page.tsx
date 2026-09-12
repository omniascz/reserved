'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAccessToken, listTenants, type TenantListRow } from '@/lib/api';
import { MasterNavHeader } from '@/components/MasterNavHeader';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  trial: { label: 'Trial', cls: 'bg-blue-100 text-blue-800' },
  active: { label: 'Aktivní', cls: 'bg-green-100 text-green-800' },
  expired: { label: 'Vypršený', cls: 'bg-slate-200 text-slate-700' },
  suspended: { label: 'Suspendovaný', cls: 'bg-red-100 text-red-800' },
  deleted: { label: 'Smazaný', cls: 'bg-slate-200 text-slate-500' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

function effectiveStatus(t: TenantListRow): string {
  if (t.deletedAt) return 'deleted';
  if (t.suspendedAt) return 'suspended';
  return t.status;
}

export default function TenantsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TenantListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [plan, setPlan] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const res = await listTenants({
        status: status || undefined,
        plan: plan || undefined,
        search: search || undefined,
        limit: 100,
      });
      setRows(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba pri nacitani');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <MasterNavHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tenanti ({total})</h1>
        </div>

        <section className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">Všechny</option>
              <option value="trial">Trial</option>
              <option value="active">Aktivní</option>
              <option value="suspended">Suspendovaní</option>
              <option value="deleted">Smazaní</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Plán</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">Všechny</option>
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Hledat</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="název, slug, e-mail vlastníka…"
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="bg-brand-700 hover:bg-brand-800 text-white px-4 py-1.5 rounded-md text-sm font-medium"
          >
            Použít filtr
          </button>
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
            {error}
          </div>
        )}

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Název</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Vlastník</th>
                <th className="px-4 py-2">Plán</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Registrace</th>
                <th className="px-4 py-2">Trial do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    Načítám…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    Žádní tenanti.
                  </td>
                </tr>
              )}
              {rows.map((t) => {
                const status = effectiveStatus(t);
                const cfg = STATUS_LABELS[status] ?? { label: status, cls: 'bg-slate-200' };
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/tenants/${t.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.slug}</td>
                    <td className="px-4 py-3 text-slate-600">{t.ownerEmail ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{t.plan}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(t.trialEndsAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
