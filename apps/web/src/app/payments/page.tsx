'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  generateQrForPayment,
  getAccessToken,
  listPayments,
  markPaymentPaid,
  refundPayment,
  type AdminPayment,
  type PaymentMethodType,
  type PaymentStatus,
} from '@/lib/api';

const METHOD_LABELS: Record<PaymentMethodType, string> = {
  cash: '💵 Hotovost',
  card_terminal: '💳 Karta (terminál)',
  qr_bank: '📱 QR platba',
  stripe: '🌐 Stripe',
  gopay: '🌐 GoPay',
};

const STATUS_LABELS: Record<PaymentStatus, { label: string; color: string }> = {
  pending: { label: 'Čeká', color: 'bg-amber-100 text-amber-700' },
  succeeded: { label: 'Úspěšná', color: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Selhala', color: 'bg-red-100 text-red-700' },
  refunded: { label: 'Vrácena', color: 'bg-slate-200 text-slate-700' },
  cancelled: { label: 'Zrušena', color: 'bg-slate-100 text-slate-600' },
};

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | ''>('');
  const [methodFilter, setMethodFilter] = useState<PaymentMethodType | ''>('');

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPayments({
        status: statusFilter || undefined,
        methodType: methodFilter || undefined,
      });
      setPayments(data);
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
  }, [router, statusFilter, methodFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleMarkPaid(p: AdminPayment) {
    try {
      await markPaymentPaid(p.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleRefund(p: AdminPayment) {
    const reason = window.prompt('Důvod refundu:') ?? '';
    if (!reason) return;
    try {
      await refundPayment(p.id, undefined, reason);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleShowQr(p: AdminPayment) {
    try {
      const qr = await generateQrForPayment(p.id);
      window.open(
        `/payments/qr?spayd=${encodeURIComponent(qr.spayd)}&amount=${qr.amount}&iban=${encodeURIComponent(qr.iban)}`,
        '_blank',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  // Sumy pro souhrn
  const totalSucceeded = payments
    .filter((p) => p.status === 'succeeded' && p.amountHellers > 0)
    .reduce((sum, p) => sum + p.amountHellers, 0);
  const totalPending = payments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amountHellers, 0);
  const totalRefunded = payments
    .filter((p) => p.amountHellers < 0)
    .reduce((sum, p) => sum + Math.abs(p.amountHellers), 0);

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold">Platby</h2>
            <p className="text-sm text-slate-500">
              Záznamy všech plateb — hotovost, karta na terminálu, QR, online brány.
            </p>
          </div>
          <Link
            href="/payments/methods"
            className="text-sm bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded font-medium"
          >
            ⚙️ Nastavit platební metody
          </Link>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <SummaryCard
            label="Vybráno"
            value={`${(totalSucceeded / 100).toLocaleString('cs-CZ')} Kč`}
            color="emerald"
          />
          <SummaryCard
            label="Čeká na úhradu"
            value={`${(totalPending / 100).toLocaleString('cs-CZ')} Kč`}
            color="amber"
          />
          <SummaryCard
            label="Vráceno"
            value={`-${(totalRefunded / 100).toLocaleString('cs-CZ')} Kč`}
            color="slate"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Filtry */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3 flex gap-2 items-center flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | '')}
            className="px-3 py-1.5 border border-slate-300 rounded text-sm"
          >
            <option value="">Všechny stavy</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as PaymentMethodType | '')}
            className="px-3 py-1.5 border border-slate-300 rounded text-sm"
          >
            <option value="">Všechny metody</option>
            {Object.entries(METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Datum</th>
                <th className="text-left px-4 py-3 font-semibold">Metoda</th>
                <th className="text-right px-4 py-3 font-semibold">Částka</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="text-left px-4 py-3 font-semibold">Popis</th>
                <th className="w-48"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Žádné platby.
                  </td>
                </tr>
              )}
              {payments.map((p) => {
                const status = STATUS_LABELS[p.status];
                const amount = (p.amountHellers / 100).toLocaleString('cs-CZ');
                const isRefund = p.amountHellers < 0;
                return (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {new Date(p.createdAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}
                    </td>
                    <td className="px-4 py-3">{METHOD_LABELS[p.methodType] ?? p.methodType}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        isRefund ? 'text-red-600' : 'text-slate-900'
                      }`}
                    >
                      {amount} {p.currency}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{p.description ?? '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {p.status === 'pending' && p.methodType === 'qr_bank' && (
                        <>
                          <button
                            onClick={() => handleShowQr(p)}
                            className="text-sm text-brand-600 hover:text-brand-800 mr-2"
                          >
                            QR
                          </button>
                          <button
                            onClick={() => handleMarkPaid(p)}
                            className="text-sm text-emerald-600 hover:text-emerald-800 mr-2"
                          >
                            Zaplaceno
                          </button>
                        </>
                      )}
                      {p.status === 'succeeded' && !isRefund && (
                        <button
                          onClick={() => handleRefund(p)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'emerald' | 'amber' | 'slate';
}) {
  const colorClass =
    color === 'emerald'
      ? 'text-emerald-700'
      : color === 'amber'
        ? 'text-amber-700'
        : 'text-slate-700';
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}
