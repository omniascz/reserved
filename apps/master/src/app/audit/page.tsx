'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAccessToken, getGlobalAudit, type AuditEntry } from '@/lib/api';
import { MasterNavHeader } from '@/components/MasterNavHeader';

const ACTION_LABELS: Record<string, string> = {
  login: 'Přihlášení',
  logout: 'Odhlášení',
  password_changed: 'Změna hesla',
  tenant_suspended: 'Tenant suspendován',
  tenant_reactivated: 'Tenant reaktivován',
  tenant_trial_extended: 'Prodloužený trial',
  tenant_plan_changed: 'Změna plánu',
  tenant_soft_deleted: 'Tenant smazán',
  tenant_impersonated: 'Impersonace',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ');
}

export default function AuditPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

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
      const data = await getGlobalAudit({ action: filter || undefined, limit: 200 });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <MasterNavHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Audit log akcí master adminů</h1>

        <section className="bg-white rounded-xl border border-slate-200 p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Typ akce</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-full max-w-xs"
            >
              <option value="">Všechny</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={load}
            className="bg-brand-700 hover:bg-brand-800 text-white px-4 py-1.5 rounded-md text-sm font-medium"
          >
            Použít
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
                <th className="px-4 py-2">Kdy</th>
                <th className="px-4 py-2">Admin</th>
                <th className="px-4 py-2">Akce</th>
                <th className="px-4 py-2">Cíl</th>
                <th className="px-4 py-2">Detail</th>
                <th className="px-4 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Načítám…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Žádné akce.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmt(r.createdAt)}</td>
                  <td className="px-4 py-2">{r.adminEmail ?? r.adminId.slice(0, 8)}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {ACTION_LABELS[r.action] ?? r.action}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.targetType === 'tenant' ? (
                      <Link
                        href={`/tenants/${r.targetId}`}
                        className="text-brand-700 hover:underline"
                      >
                        tenant {r.targetId.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-slate-500">
                        {r.targetType} {r.targetId.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 max-w-xs truncate">
                    {Object.keys(r.payload).length > 0 ? JSON.stringify(r.payload) : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
