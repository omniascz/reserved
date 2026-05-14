'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PortalHeader } from '@/components/PortalHeader';
import { getAccessToken, listMyTimePacks, PortalApiError, type PortalTimePack } from '@/lib/api';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktivní', color: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'Vypršela', color: 'bg-slate-200 text-slate-700' },
  used_up: { label: 'Vyčerpaná', color: 'bg-amber-100 text-amber-800' },
  refunded: { label: 'Vrácena', color: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Zrušena', color: 'bg-red-100 text-red-700' },
};

export default function MyTimePacksPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const [packs, setPacks] = useState<PortalTimePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/${tenant}/login`);
      return;
    }
    listMyTimePacks()
      .then(setPacks)
      .catch((e) => {
        if (e instanceof PortalApiError && (e.status === 401 || e.status === 403)) {
          router.replace(`/${tenant}/login`);
        } else {
          setError(e?.message ?? 'Chyba');
        }
      })
      .finally(() => setLoading(false));
  }, [tenant, router]);

  const active = packs.filter((p) => p.status === 'active');
  const inactive = packs.filter((p) => p.status !== 'active');

  return (
    <div className="min-h-screen flex flex-col">
      <PortalHeader />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-1">Moje časové balíčky</h1>
        <p className="text-sm text-slate-500 mb-6">
          Předplatné na omezený nebo neomezený počet rezervací po dobu platnosti.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading && <div className="text-slate-500">Načítám…</div>}

        {!loading && packs.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            Zatím nemáš žádný časový balíček.
          </div>
        )}

        {active.length > 0 && (
          <Section title={`Aktivní (${active.length})`}>
            {active.map((p) => (
              <TimeCard key={p.id} pack={p} />
            ))}
          </Section>
        )}

        {inactive.length > 0 && (
          <Section title={`Historie (${inactive.length})`}>
            {inactive.map((p) => (
              <TimeCard key={p.id} pack={p} />
            ))}
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="font-semibold text-slate-700 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function TimeCard({ pack }: { pack: PortalTimePack }) {
  const status = STATUS_LABEL[pack.status] ?? { label: pack.status, color: 'bg-slate-100' };
  const limit = pack.snapshotMaxBookingsPerPeriod;
  const percent = limit !== null && limit > 0 ? ((limit - pack.bookingsUsed) / limit) * 100 : 100;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{pack.packName ?? 'Časový balíček'}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
              {status.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Platí do {new Date(pack.validUntil).toLocaleDateString('cs-CZ')}
            {pack.snapshotMaxBookingsPerDay && ` · max ${pack.snapshotMaxBookingsPerDay}/den`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-brand-600 font-mono">
            {limit !== null ? Math.max(0, limit - pack.bookingsUsed) : '∞'}
          </div>
          <div className="text-xs text-slate-500">
            {limit !== null ? `z ${limit}` : 'neomezeno'}
          </div>
        </div>
      </div>

      {limit !== null && (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              pack.status === 'active' ? 'bg-brand-500' : 'bg-slate-300'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
