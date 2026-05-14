'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PortalHeader } from '@/components/PortalHeader';
import {
  getAccessToken,
  listMySubscriptions,
  PortalApiError,
  type PortalSubscription,
} from '@/lib/api';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  incomplete: { label: 'Nedokončeno', color: 'bg-slate-100 text-slate-700' },
  trialing: { label: 'Trial', color: 'bg-blue-100 text-blue-800' },
  active: { label: 'Aktivní', color: 'bg-emerald-100 text-emerald-700' },
  past_due: { label: 'Po splatnosti', color: 'bg-amber-100 text-amber-800' },
  canceled: { label: 'Zrušeno', color: 'bg-red-100 text-red-700' },
  unpaid: { label: 'Neplaceno', color: 'bg-red-100 text-red-700' },
  incomplete_expired: { label: 'Vypršelo', color: 'bg-slate-100 text-slate-600' },
};

const INTERVAL_LABEL: Record<string, string> = {
  monthly: 'měsíčně',
  quarterly: 'čtvrtletně',
  yearly: 'ročně',
};

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

export default function MySubscriptionsPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const [subs, setSubs] = useState<PortalSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/${tenant}/login`);
      return;
    }
    listMySubscriptions()
      .then(setSubs)
      .catch((e) => {
        if (e instanceof PortalApiError && (e.status === 401 || e.status === 403)) {
          router.replace(`/${tenant}/login`);
        } else {
          setError(e?.message ?? 'Chyba');
        }
      })
      .finally(() => setLoading(false));
  }, [tenant, router]);

  const active = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
  const inactive = subs.filter((s) => s.status !== 'active' && s.status !== 'trialing');

  return (
    <div className="min-h-screen flex flex-col">
      <PortalHeader />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-1">Moje předplatné</h1>
        <p className="text-sm text-slate-500 mb-6">
          Aktivní předplatné a historie. Pro správu (změna karty, zrušení) kontaktuj salon.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading && <div className="text-slate-500">Načítám…</div>}

        {!loading && subs.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            Zatím nemáš žádné předplatné. Pokud salon nabízí členství, kontaktuj je.
          </div>
        )}

        {active.length > 0 && (
          <Section title={`Aktivní (${active.length})`}>
            {active.map((s) => (
              <SubscriptionCard key={s.id} sub={s} />
            ))}
          </Section>
        )}

        {inactive.length > 0 && (
          <Section title={`Historie (${inactive.length})`}>
            {inactive.map((s) => (
              <SubscriptionCard key={s.id} sub={s} />
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

function SubscriptionCard({ sub }: { sub: PortalSubscription }) {
  const status = STATUS_LABEL[sub.status] ?? { label: sub.status, color: 'bg-slate-100' };
  const benefits = sub.snapshotBenefits ?? {};
  const hasBenefits =
    benefits.discountPercent !== undefined ||
    benefits.priorityAccess ||
    benefits.freeCreditsPerPeriod !== undefined ||
    (benefits.exclusiveServiceIds?.length ?? 0) > 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{sub.planName ?? 'Předplatné'}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
              {status.label}
            </span>
            {sub.cancelAtPeriodEnd && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                končí na konci období
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {formatPrice(sub.snapshotPriceHellers)} /{' '}
            {INTERVAL_LABEL[sub.snapshotBillingInterval] ?? sub.snapshotBillingInterval}
          </p>
          {sub.currentPeriodEnd && (
            <p className="text-xs text-slate-500 mt-0.5">
              {sub.status === 'trialing' && sub.trialEnd
                ? `Trial do ${new Date(sub.trialEnd).toLocaleDateString('cs-CZ')}`
                : `Období do ${new Date(sub.currentPeriodEnd).toLocaleDateString('cs-CZ')}`}
            </p>
          )}
        </div>
      </div>

      {hasBenefits && (
        <div className="border-t border-slate-100 pt-3 mt-3">
          <div className="text-xs font-medium text-slate-700 mb-2">Tvoje výhody:</div>
          <ul className="text-xs text-slate-600 space-y-1">
            {benefits.discountPercent !== undefined && (
              <li>✓ {benefits.discountPercent}% sleva na všechny služby</li>
            )}
            {benefits.priorityAccess && <li>✓ Prioritní rezervace</li>}
            {benefits.freeCreditsPerPeriod !== undefined && (
              <li>✓ {benefits.freeCreditsPerPeriod} kreditů zdarma za období</li>
            )}
            {(benefits.exclusiveServiceIds?.length ?? 0) > 0 && (
              <li>✓ Přístup k exkluzivním službám</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
