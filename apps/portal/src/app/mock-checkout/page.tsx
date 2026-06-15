'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Mock checkout page — pro dev/test. Simuluje Stripe/GoPay checkout
// bez external API. User klikne 'Zaplatit' nebo 'Zruseni' a triggerne
// webhook → backend update.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

function MockCheckoutInner() {
  const search = useSearchParams();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const externalId = search.get('id') ?? '';
  const amount = Number(search.get('amount') ?? '0');
  const description = search.get('desc') ?? 'Platba';
  const successUrl = search.get('success') ?? '/';
  const cancelUrl = search.get('cancel') ?? '/';
  // Tenant slug pro webhook URL — vezme se z aktualniho hostu
  const tenantSlug = typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : '';

  async function simulateWebhook(status: 'succeeded' | 'failed') {
    setProcessing(true);
    setError(null);
    try {
      const webhookUrl = `${API_BASE}/payments/webhooks/${tenantSlug}/mock`;
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalId,
          status,
          amountHellers: amount,
        }),
      });
      if (status === 'succeeded') {
        window.location.href = successUrl.replace('{CHECKOUT_SESSION_ID}', externalId);
      } else {
        window.location.href = cancelUrl;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
      setProcessing(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-xs text-amber-700 bg-amber-100 px-3 py-1 rounded-full inline-block mb-3">
            🧪 MOCK CHECKOUT — jen pro dev/test
          </div>
          <h1 className="text-2xl font-bold mb-1">Platební brána</h1>
          <p className="text-sm text-slate-500">
            Toto je simulace, žádná reálná platba se neprovede.
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-slate-500">Předmět:</span>
            <span className="font-medium">{description}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>Částka:</span>
            <span className="font-mono">{(amount / 100).toLocaleString('cs-CZ')} Kč</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={() => simulateWebhook('succeeded')}
            disabled={processing}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50"
          >
            {processing ? 'Zpracovávám…' : '✓ Simulovat úspěšnou platbu'}
          </button>
          <button
            onClick={() => simulateWebhook('failed')}
            disabled={processing}
            className="w-full bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-2.5 rounded-lg disabled:opacity-50"
          >
            × Simulovat selhání
          </button>
          <a
            href={cancelUrl}
            className="block w-full text-center text-slate-500 hover:text-slate-700 text-sm py-2"
          >
            Zrušit a vrátit se
          </a>
        </div>

        <p className="text-xs text-slate-400 mt-6 text-center">
          V produkci nahradí Stripe / GoPay skutečnou checkout stránkou.
        </p>
      </div>
    </main>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <MockCheckoutInner />
    </Suspense>
  );
}
