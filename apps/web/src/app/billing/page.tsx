'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  cancelBillingSubscription,
  createBillingCheckout,
  createBillingPortal,
  getAccessToken,
  getBillingStatus,
  listBillingPlans,
  resumeBillingSubscription,
  type BillingStatus,
  type PlatformPlan,
} from '@/lib/api';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  trial: { label: 'Trial', cls: 'bg-blue-100 text-blue-800' },
  active: { label: 'Aktivní', cls: 'bg-green-100 text-green-800' },
  trialing: { label: 'Trial (Stripe)', cls: 'bg-blue-100 text-blue-800' },
  past_due: { label: 'Po splatnosti', cls: 'bg-orange-100 text-orange-800' },
  unpaid: { label: 'Nezaplaceno', cls: 'bg-red-100 text-red-800' },
  canceled: { label: 'Zrušeno', cls: 'bg-slate-200 text-slate-700' },
  suspended: { label: 'Pozastaveno', cls: 'bg-red-200 text-red-900' },
  incomplete: { label: 'Neúplné', cls: 'bg-orange-100 text-orange-800' },
};

function fmtPrice(hellers: number, currency: string): string {
  if (hellers === 0) return 'Individuální';
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(hellers / 100);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function BillingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const [s, p] = await Promise.all([getBillingStatus(), listBillingPlans()]);
      setStatus(s);
      setPlans(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade(planKey: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await createBillingCheckout({ planKey, interval });
      window.location.href = checkoutUrl;
    } catch (e) {
      if (e instanceof AdminApiError && e.code === 'BILLING_NOT_CONFIGURED') {
        setError(
          'Stripe billing zatím není v této instanci nakonfigurován. Kontaktuj support pro upgrade.',
        );
      } else {
        setError(e instanceof Error ? e.message : 'Chyba');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePortal() {
    if (busy) return;
    setBusy(true);
    try {
      const { portalUrl } = await createBillingPortal();
      window.location.href = portalUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Opravdu zrušit předplatné na konci aktuálního období?')) return;
    setBusy(true);
    try {
      await cancelBillingSubscription(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    try {
      await resumeBillingSubscription();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 text-slate-400">Načítám…</main>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 text-red-600">{error ?? 'Nelze načíst billing.'}</main>
      </div>
    );
  }

  const cfg = STATUS_LABELS[status.status] ?? { label: status.status, cls: 'bg-slate-200' };
  const currentPlan = plans.find((p) => p.key === status.plan);

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Fakturace</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tvé předplatné Reserved. Tady upgraduješ plán nebo spravuješ kartu.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
            {error}
          </div>
        )}

        {/* Current plan card */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Aktuální plán
              </div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold">{status.planName ?? status.plan}</h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${cfg.cls}`}>
                  {cfg.label}
                </span>
              </div>
              {currentPlan && (
                <p className="text-sm text-slate-600 mt-2">{currentPlan.description}</p>
              )}
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                {status.trialEndsAt && (
                  <div>
                    Trial končí: <strong>{fmtDate(status.trialEndsAt)}</strong>
                  </div>
                )}
                {status.currentPeriodEnd && (
                  <div>
                    Další platba: <strong>{fmtDate(status.currentPeriodEnd)}</strong>
                  </div>
                )}
                {status.cancelAtPeriodEnd && (
                  <div className="text-orange-700 font-medium">
                    ⚠️ Předplatné bude zrušeno na konci aktuálního období.
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              {status.hasPaymentMethod && (
                <button
                  onClick={handlePortal}
                  disabled={busy}
                  className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Spravovat kartu / fakturaci
                </button>
              )}
              {status.cancelAtPeriodEnd ? (
                <button
                  onClick={handleResume}
                  disabled={busy}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Obnovit předplatné
                </button>
              ) : status.hasPaymentMethod ? (
                <button
                  onClick={handleCancel}
                  disabled={busy}
                  className="text-red-700 hover:text-red-800 text-sm font-medium"
                >
                  Zrušit předplatné
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* Plan selector */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Změnit plán</h2>
            <div className="bg-white border border-slate-200 rounded-lg p-1 flex">
              <button
                onClick={() => setInterval('monthly')}
                className={`px-3 py-1 text-sm rounded ${
                  interval === 'monthly' ? 'bg-brand-600 text-white' : 'text-slate-600'
                }`}
              >
                Měsíčně
              </button>
              <button
                onClick={() => setInterval('yearly')}
                className={`px-3 py-1 text-sm rounded ${
                  interval === 'yearly' ? 'bg-brand-600 text-white' : 'text-slate-600'
                }`}
              >
                Ročně <span className="text-xs">(2 měsíce zdarma)</span>
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {plans
              .filter((p) => p.key !== 'free' && p.key !== 'enterprise')
              .map((plan) => {
                const isCurrent = status.plan === plan.key;
                const price =
                  interval === 'yearly' ? plan.yearlyPriceHellers : plan.monthlyPriceHellers;
                return (
                  <div
                    key={plan.id}
                    className={`bg-white rounded-xl border-2 p-6 ${
                      isCurrent ? 'border-brand-600' : 'border-slate-200'
                    }`}
                  >
                    {isCurrent && (
                      <div className="text-xs font-semibold text-brand-700 mb-1">
                        ✓ Aktuální plán
                      </div>
                    )}
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <p className="text-sm text-slate-600 mt-1">{plan.description}</p>
                    <div className="mt-4">
                      <span className="text-3xl font-bold">{fmtPrice(price, plan.currency)}</span>
                      <span className="text-sm text-slate-500 ml-1">
                        / {interval === 'monthly' ? 'měsíc' : 'rok'}
                      </span>
                    </div>
                    <ul className="mt-4 space-y-1 text-sm text-slate-600">
                      {plan.limits.maxEmployees ? (
                        <li>✓ až {String(plan.limits.maxEmployees)} zaměstnanců</li>
                      ) : null}
                      {plan.limits.maxBookingsPerMonth ? (
                        <li>
                          ✓ až {Number(plan.limits.maxBookingsPerMonth).toLocaleString('cs-CZ')}{' '}
                          rezervací/měsíc
                        </li>
                      ) : (
                        <li>✓ neomezené rezervace</li>
                      )}
                      {plan.features.smsNotifications && <li>✓ SMS notifikace</li>}
                      {plan.features.googleCalendar && <li>✓ Google Calendar</li>}
                      {plan.features.packages && <li>✓ Permanentky a balíčky</li>}
                      {plan.features.corporateAccounts && <li>✓ Firemní účty</li>}
                      {plan.features.apiAccess && <li>✓ API přístup</li>}
                      {plan.features.whatsapp && <li>✓ WhatsApp Business</li>}
                      {plan.features.aiNoShowPrediction && <li>✓ AI no-show prediction</li>}
                    </ul>
                    {!isCurrent && (
                      <button
                        onClick={() => handleUpgrade(plan.key)}
                        disabled={busy}
                        className="mt-5 w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50"
                      >
                        {busy ? '…' : 'Vybrat plán'}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Potřebuješ Enterprise plán (řetězec, vlastní doména, SSO, SLA)?{' '}
            <a href="mailto:sales@reserved.cz" className="text-brand-700 hover:underline">
              Kontaktuj nás
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
