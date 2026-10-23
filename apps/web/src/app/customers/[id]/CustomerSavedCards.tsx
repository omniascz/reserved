'use client';

// Uložená karta zákazníka (P4). Karta slouží ke strhnutí storno / no-show
// poplatku bez odkazu k úhradě — pravidlo „Storno poplatek" ji použije samo.
// Číslo karty zákazník zadává na stránce Stripe; tady je vidět jen značka,
// poslední 4 číslice a platnost.

import { useCallback, useEffect, useState } from 'react';
import {
  listCustomerCards,
  removeCustomerCard,
  requestCustomerCard,
  type SavedCard,
} from '@/lib/api';

function popisKarty(c: SavedCard): string {
  const znacka = c.brand ? c.brand.toUpperCase() : 'Karta';
  const platnost =
    c.expMonth && c.expYear
      ? ` · platí do ${String(c.expMonth).padStart(2, '0')}/${c.expYear}`
      : '';
  return `${znacka} •••• ${c.last4 ?? '????'}${platnost}`;
}

export function CustomerSavedCards({ customerId }: { customerId: string }) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await listCustomerCards(customerId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function poslatOdkaz() {
    setBusy(true);
    setInfo(null);
    try {
      const r = await requestCustomerCard(customerId, true);
      setInfo(
        r.emailed
          ? 'Odkaz na uložení karty jsme zákazníkovi poslali e-mailem.'
          : `Zákazník nemá e-mail — pošlete mu odkaz jinak: ${r.setupUrl}`,
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function odebrat(card: SavedCard) {
    if (!window.confirm(`Odebrat kartu ${popisKarty(card)}?`)) return;
    try {
      await removeCustomerCard(customerId, card.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
      data-testid="saved-cards-panel"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Uložená karta</h3>
        <button
          type="button"
          onClick={poslatOdkaz}
          disabled={busy}
          className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg"
        >
          {busy ? 'Posílám…' : 'Poslat odkaz na uložení karty'}
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-3">
        Z uložené karty se strhne storno nebo no-show poplatek podle pravidel, bez odkazu k úhradě.
        Vyžaduje zapnutou bránu Stripe.
      </p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {info && <p className="text-sm text-emerald-700 mb-2 break-all">{info}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">Načítám…</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-slate-400">Zákazník nemá uloženou kartu.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-mono">{popisKarty(c)}</span>
              <button
                type="button"
                onClick={() => odebrat(c)}
                className="text-red-600 hover:underline"
              >
                Odebrat
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
