'use client';

// Reporty: vytíženost lekcí + MRR. Dříve byly tyto reporty jen na backendu
// bez obrazovky — tahle stránka je zpřístupňuje adminovi.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  getClassUtilization,
  getMrr,
  type ClassUtilization,
  type MrrReport,
} from '@/lib/api';

type Preset = '7d' | '30d' | '90d';
const PRESETS: { value: Preset; label: string; days: number }[] = [
  { value: '7d', label: 'Posledních 7 dní', days: 7 },
  { value: '30d', label: 'Posledních 30 dní', days: 30 },
  { value: '90d', label: 'Posledních 90 dní', days: 90 },
];

function formatKc(hellers: number): string {
  return `${(hellers / 100).toLocaleString('cs-CZ')} Kč`;
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
      {hint && <div className="text-sm text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>('30d');
  const [util, setUtil] = useState<ClassUtilization | null>(null);
  const [mrr, setMrr] = useState<MrrReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = PRESETS.find((p) => p.value === preset)?.days ?? 30;
      const from = new Date(Date.now() - days * 86400_000).toISOString();
      const to = new Date().toISOString();
      const [u, m] = await Promise.all([getClassUtilization({ from, to }), getMrr()]);
      setUtil(u);
      setMrr(m);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        clearAuth();
        router.replace('/login');
        return;
      }
      if (err instanceof AdminApiError && err.code === 'INSUFFICIENT_ROLE') {
        setError('Na reporty nemáš oprávnění.');
      } else {
        setError(err instanceof Error ? err.message : 'Načtení reportů selhalo.');
      }
    } finally {
      setLoading(false);
    }
  }, [preset, router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void reload();
  }, [reload, router]);

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Reporty</h1>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 mb-6">
            {error}
          </div>
        )}
        {loading && <div className="text-slate-500">Načítám…</div>}

        {!loading && util && (
          <section className="mb-8">
            <h2 className="text-lg font-medium mb-3">Vytíženost lekcí</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Lekcí" value={String(util.sessions)} />
              <KpiCard
                label="Naplněnost"
                value={`${util.fillRatePct} %`}
                hint={`${util.totalBooked} / ${util.totalCapacity} míst`}
              />
              <KpiCard
                label="Docházka"
                value={`${util.attendanceRatePct} %`}
                hint={`${util.present} přišlo · ${util.noShow} no-show`}
              />
              <KpiCard label="Obsazená místa" value={String(util.totalBooked)} />
            </div>
          </section>
        )}

        {!loading && mrr && (
          <section>
            <h2 className="text-lg font-medium mb-3">Předplatné (MRR)</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard label="Aktivní předplatná" value={String(mrr.activeSubscriptions)} />
              <KpiCard label="MRR" value={formatKc(mrr.mrrHellers)} hint="měsíčně opakovaně" />
              <KpiCard label="ARR" value={formatKc(mrr.arrHellers)} hint="ročně" />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
