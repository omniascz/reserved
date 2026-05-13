'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// QR generator pomocí Google Charts API (žádné npm deps).
// Alternativně: lze použít qrcode.react, ale zatim minimalisticky.

export default function QrPaymentPage() {
  const search = useSearchParams();
  const [qrUrl, setQrUrl] = useState<string>('');
  const spayd = search.get('spayd') ?? '';
  const amount = search.get('amount') ?? '';
  const iban = search.get('iban') ?? '';

  useEffect(() => {
    if (!spayd) return;
    // Použijeme qrserver.com (zdarma, žádné keys)
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(spayd)}`;
    setQrUrl(url);
  }, [spayd]);

  if (!spayd) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-slate-500">QR data chybí. Otevři stránku z platby v admin.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 print:p-0">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center print:shadow-none">
        <h1 className="text-xl font-bold mb-1">QR platba</h1>
        <p className="text-sm text-slate-500 mb-4">Naskenuj svojí mobilní bankou</p>

        {qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrUrl}
            alt="QR kód platby"
            className="mx-auto mb-4 border border-slate-200 rounded-lg"
          />
        )}

        <div className="bg-slate-50 rounded-lg p-3 text-left text-sm mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-slate-500">Částka:</span>
            <span className="font-bold font-mono">{amount} Kč</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">IBAN:</span>
            <span className="font-mono">{iban}</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Po dorazení převodu označí salon platbu jako „zaplaceno".
        </p>

        <button
          onClick={() => window.print()}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium print:hidden"
        >
          🖨️ Vytisknout
        </button>
      </div>
    </main>
  );
}
