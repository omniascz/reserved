'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createCheckout,
  listPaymentMethods,
  listPayments,
  recordPayment,
  type AdminPayment,
  type AdminPaymentMethod,
  type PaymentMethodType,
} from '@/lib/api';

const METHOD_LABELS: Record<string, string> = {
  cash: '💵 Hotovost',
  card_terminal: '💳 Karta (terminál)',
  qr_bank: '📱 QR platba',
  stripe: '🌐 Stripe',
  gopay: '🌐 GoPay',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Čeká', color: 'bg-amber-100 text-amber-700' },
  succeeded: { label: 'Úspěšná', color: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Selhala', color: 'bg-red-100 text-red-700' },
  refunded: { label: 'Vrácena', color: 'bg-slate-200 text-slate-700' },
  cancelled: { label: 'Zrušena', color: 'bg-slate-100 text-slate-600' },
};

export function CustomerPayments({ customerId }: { customerId: string }) {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [methods, setMethods] = useState<AdminPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    methodType: 'cash' as PaymentMethodType,
    amount: '',
    description: '',
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([listPayments({ customerId }), listPaymentMethods()]);
      setPayments(p);
      setMethods(m.filter((x) => x.isEnabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setError('Zadej platnou částku.');
      return;
    }
    try {
      // Online brany — otevřít checkout
      if (form.methodType === 'stripe' || form.methodType === 'gopay') {
        const result = await createCheckout({
          methodType: form.methodType,
          amountHellers: Math.round(amount * 100),
          description: form.description || `Platba (${amount.toLocaleString('cs-CZ')} Kč)`,
          customerId,
        });
        // Otevři checkout v novém okně
        window.open(result.checkoutUrl, '_blank');
        setShowForm(false);
        setForm({ methodType: 'cash', amount: '', description: '' });
        reload();
        return;
      }

      await recordPayment({
        customerId,
        methodType: form.methodType,
        amountHellers: Math.round(amount * 100),
        description: form.description || undefined,
      });
      setShowForm(false);
      setForm({ methodType: 'cash', amount: '', description: '' });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  const totalSucceeded = payments
    .filter((p) => p.status === 'succeeded' && p.amountHellers > 0)
    .reduce((sum, p) => sum + p.amountHellers, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="font-semibold">Platby ({payments.length})</h3>
          {totalSucceeded > 0 && (
            <p className="text-xs text-slate-500">
              Celkem zaplaceno: {(totalSucceeded / 100).toLocaleString('cs-CZ')} Kč
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded font-medium"
        >
          {showForm ? 'Zavřít' : '+ Přijmout platbu'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-2 rounded mb-3">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 space-y-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Metoda</label>
              <select
                value={form.methodType}
                onChange={(e) =>
                  setForm({ ...form, methodType: e.target.value as PaymentMethodType })
                }
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
              >
                {methods.length === 0 ? (
                  <option value="cash">Nejdřív nastav metody v /payments/methods</option>
                ) : (
                  methods.map((m) => (
                    <option key={m.methodType} value={m.methodType}>
                      {METHOD_LABELS[m.methodType] ?? m.methodType}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Částka (Kč)</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                step="0.01"
                min="0"
                required
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Popis (volitelně)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Stříhání, balíček 10×, …"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
            />
          </div>
          <button
            type="submit"
            className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded font-medium"
          >
            Zaznamenat platbu
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Načítám…</div>
      ) : payments.length === 0 ? (
        <div className="text-slate-500 text-sm">Žádné platby.</div>
      ) : (
        <div className="space-y-1.5">
          {payments.map((p) => {
            const status = STATUS_LABELS[p.status] ?? { label: p.status, color: 'bg-slate-100' };
            const isRefund = p.amountHellers < 0;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 text-sm py-1.5 border-b border-slate-100"
              >
                <span className="text-xs text-slate-500 w-32">
                  {new Date(p.createdAt).toLocaleDateString('cs-CZ', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {METHOD_LABELS[p.methodType] ?? p.methodType}
                  {p.description && <span className="text-slate-500 ml-1">— {p.description}</span>}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                  {status.label}
                </span>
                <span
                  className={`font-mono w-24 text-right ${
                    isRefund ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {(p.amountHellers / 100).toLocaleString('cs-CZ')} {p.currency}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
