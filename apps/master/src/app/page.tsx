'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getAccessToken,
  getAtRiskTenants,
  getDashboardOverview,
  getRegistrationsPerDay,
  type AtRiskTenant,
  type DashboardOverview,
  type RegistrationsPerDay,
} from '@/lib/api';
import { MasterNavHeader } from '@/components/MasterNavHeader';

const REASON_LABELS: Record<AtRiskTenant['reason'], string> = {
  trial_ending_soon: 'Trial končí brzy',
  onboarding_stalled: 'Onboarding zaseknutý',
  no_activity: 'Bez aktivity',
};

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [chart, setChart] = useState<RegistrationsPerDay[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskTenant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    Promise.all([getDashboardOverview(), getRegistrationsPerDay(), getAtRiskTenants()])
      .then(([o, c, r]) => {
        setOverview(o);
        setChart(c);
        setAtRisk(r);
      })
      .catch((e) => setError(e.message ?? 'Neco se pokazilo'));
  }, [router]);

  return (
    <div className="min-h-screen">
      <MasterNavHeader />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
            {error}
          </div>
        )}

        {!overview && !error && <div className="text-slate-400">Načítám…</div>}

        {overview && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Tile label="Celkem tenantů" value={overview.totalTenants} />
              <Tile label="V trialu" value={overview.trialTenants} tone="blue" />
              <Tile label="Aktivní" value={overview.activeTenants} tone="green" />
              <Tile label="Suspendovaní" value={overview.suspendedTenants} tone="red" />
              <Tile label="Smazaní" value={overview.deletedTenants} tone="slate" />
              <Tile label="Nové reg. 7d" value={overview.newRegistrations7d} />
              <Tile label="Nové reg. 30d" value={overview.newRegistrations30d} />
              <Tile label="Rezervace 30d" value={overview.totalBookings30d} />
              <Tile label="Celkem zákazníků" value={overview.totalCustomers} />
              <Tile
                label="Trial končí <3d"
                value={overview.trialEndingSoon}
                tone={overview.trialEndingSoon > 0 ? 'orange' : undefined}
              />
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-semibold mb-4">Registrace za posledních 30 dní</h2>
              {chart.length === 0 ? (
                <p className="text-slate-400">Žádné registrace.</p>
              ) : (
                <MiniBarChart data={chart} />
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-semibold mb-4">Tenanti v problému</h2>
              {atRisk.length === 0 ? (
                <p className="text-slate-400">Žádné problémy — vše v pořádku.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {atRisk.map((t, i) => (
                    <li
                      key={`${t.id}-${t.reason}-${i}`}
                      className="py-3 flex items-center justify-between"
                    >
                      <div>
                        <Link
                          href={`/tenants/${t.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {t.name}
                        </Link>{' '}
                        <span className="text-slate-400 text-sm">/ {t.slug}</span>
                        {t.ownerEmail && (
                          <span className="text-slate-500 text-sm"> · {t.ownerEmail}</span>
                        )}
                      </div>
                      <span className="text-xs font-medium px-2 py-1 rounded bg-orange-100 text-orange-800">
                        {REASON_LABELS[t.reason]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'blue' | 'green' | 'red' | 'slate' | 'orange';
}) {
  const toneClass =
    tone === 'blue'
      ? 'text-blue-700'
      : tone === 'green'
        ? 'text-green-700'
        : tone === 'red'
          ? 'text-red-700'
          : tone === 'orange'
            ? 'text-orange-700'
            : tone === 'slate'
              ? 'text-slate-500'
              : 'text-slate-900';
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value.toLocaleString('cs-CZ')}</div>
    </div>
  );
}

function MiniBarChart({ data }: { data: RegistrationsPerDay[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-brand-500 rounded-t transition hover:bg-brand-600"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: '4px' }}
            title={`${d.day}: ${d.count}`}
          />
          <span className="text-[10px] text-slate-400">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
