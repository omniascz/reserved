'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  cancelSubscription,
  listCustomerSubscriptions,
  listSubscriptionPlans,
  subscribeCustomer,
  type AdminCustomerSubscription,
  type AdminSubscriptionPlan,
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
  monthly: 'měs.',
  quarterly: 'čtvrt.',
  yearly: 'ročně',
};

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

export function CustomerSubscriptions({ customerId }: { customerId: string }) {
  const [subs, setSubs] = useState<AdminCustomerSubscription[]>([]);
  const [plans, setPlans] = useState<AdminSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [note, setNote] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        listCustomerSubscriptions(customerId),
        listSubscriptionPlans(),
      ]);
      setSubs(s);
      setPlans(p.filter((pp) => pp.isActive));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlan) return;
    setError(null);
    try {
      const origin = window.location.origin;
      const result = await subscribeCustomer(customerId, {
        planId: selectedPlan,
        successUrl: `${origin}/customers/${customerId}?sub_success=1`,
        cancelUrl: `${origin}/customers/${customerId}?sub_cancel=1`,
        note: note || undefined,
      });
      // Redirect na Stripe Checkout
      window.location.href = result.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleCancel(sub: AdminCustomerSubscription) {
    const atPeriodEnd = confirm(
      `Zrušit předplatné "${sub.planName}"?\n\nOK = zruší se až po skončení období (zákazník dál čerpá do konce).\nZrušit = okamžitě (proporcionalní refund podle Stripe nastavení).`,
    );
    try {
      await cancelSubscription(sub.id, { atPeriodEnd });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Předplatné ({subs.length})</h3>
        <button
          onClick={() => setShowSubscribe(!showSubscribe)}
          className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded font-medium"
        >
          {showSubscribe ? 'Zavřít' : '+ Nové předplatné'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-2 rounded mb-3">
          {error}
        </div>
      )}

      {showSubscribe && (
        <form
          onSubmit={handleSubscribe}
          className="border border-slate-200 rounded p-3 mb-3 space-y-2"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Plán</label>
            <select
              required
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            >
              <option value="">— vyber plán —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatPrice(p.priceHellers)} / {INTERVAL_LABEL[p.billingInterval]})
                  {p.trialDays > 0 ? ` — ${p.trialDays} dní zdarma` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Poznámka</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-slate-500">
            Po kliknutí se přesměrujete na Stripe Checkout pro zadání platební karty zákazníka.
          </p>
          <button
            type="submit"
            disabled={!selectedPlan}
            className="bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded text-sm font-medium"
          >
            Pokračovat na Stripe →
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Načítám...</p>
      ) : subs.length === 0 ? (
        <p className="text-sm text-slate-500">Žádné předplatné.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-600 border-b border-slate-100">
            <tr>
              <th className="text-left py-2">Plán</th>
              <th className="text-left py-2">Cena</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Období do</th>
              <th className="text-right py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => {
              const status = STATUS_LABEL[s.status] ?? { label: s.status, color: 'bg-slate-100' };
              const canCancel =
                s.status === 'active' || s.status === 'trialing' || s.status === 'past_due';
              return (
                <tr key={s.id} className="border-b border-slate-50">
                  <td className="py-2">
                    <div className="font-medium">{s.planName ?? '—'}</div>
                    {s.note && <div className="text-xs text-slate-500">{s.note}</div>}
                  </td>
                  <td className="py-2 text-slate-600 text-xs">
                    {formatPrice(s.snapshotPriceHellers)}
                    <div>
                      {INTERVAL_LABEL[s.snapshotBillingInterval] ?? s.snapshotBillingInterval}
                    </div>
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                    {s.cancelAtPeriodEnd && (
                      <div className="text-xs text-amber-700 mt-1">končí na konci období</div>
                    )}
                  </td>
                  <td className="py-2 text-slate-600 text-xs">
                    {s.currentPeriodEnd
                      ? new Date(s.currentPeriodEnd).toLocaleDateString('cs-CZ')
                      : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {canCancel && (
                      <button
                        onClick={() => handleCancel(s)}
                        className="text-red-600 hover:underline text-xs"
                      >
                        Zrušit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
