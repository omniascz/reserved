'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function PaymentSuccessInner() {
  const search = useSearchParams();
  const paymentId = search.get('id') ?? '';

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold mb-2">Platba úspěšná!</h1>
        <p className="text-slate-600 mb-1">Děkujeme, vaše platba byla zpracována.</p>
        {paymentId && (
          <p className="text-xs text-slate-400 mb-4 font-mono">Ref: {paymentId.slice(0, 16)}</p>
        )}
        <p className="text-sm text-slate-500 mb-6">
          Potvrzení o platbě vám pošleme e-mailem. Můžete toto okno zavřít.
        </p>
        <button
          onClick={() => window.close()}
          className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg"
        >
          Zavřít
        </button>
      </div>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessInner />
    </Suspense>
  );
}
