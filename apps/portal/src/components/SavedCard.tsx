'use client';

// Uložená platební karta zákazníka (P4). Kartu zákazník zadává na stránce
// Stripe — sem se vrátí s ?karta=ulozena (nebo ?karta=zrusena). Provozovna
// z ní strhne jen storno / no-show poplatek podle svých podmínek.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { listMyCards, removeMyCard, startCardSetup, type PortalSavedCard } from '@/lib/api';

function popis(c: PortalSavedCard): string {
  const znacka = c.brand ? c.brand.toUpperCase() : 'Karta';
  const platnost =
    c.expMonth && c.expYear
      ? ` · platí do ${String(c.expMonth).padStart(2, '0')}/${c.expYear}`
      : '';
  return `${znacka} •••• ${c.last4 ?? '????'}${platnost}`;
}

export function SavedCard() {
  const search = useSearchParams();
  const navrat = search.get('karta');
  const [cards, setCards] = useState<PortalSavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setCards(await listMyCards());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function ulozit() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await startCardSetup();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
      setBusy(false);
    }
  }

  async function odebrat(c: PortalSavedCard) {
    if (!window.confirm(`Odebrat kartu ${popis(c)}?`)) return;
    try {
      await removeMyCard(c.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <section
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3"
      data-testid="saved-card"
    >
      <h2 className="font-semibold">Platební karta</h2>
      <p className="text-sm text-slate-500">
        Uloženou kartu použijeme jen pro storno nebo no-show poplatek podle podmínek provozovny.
        Číslo karty zadáváte na zabezpečené stránce platební brány Stripe — my ho neuvidíme.
      </p>
      {navrat === 'ulozena' && (
        <p className="text-sm text-emerald-700">
          Děkujeme, karta se ukládá. Pokud ji níže ještě nevidíte, obnovte za chvíli stránku.
        </p>
      )}
      {navrat === 'zrusena' && (
        <p className="text-sm text-amber-700">Uložení karty jste zrušili, nic se neuložilo.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">Načítám…</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-slate-400">Nemáte uloženou žádnou kartu.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-mono">{popis(c)}</span>
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
      <button
        type="button"
        onClick={ulozit}
        disabled={busy}
        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {busy ? 'Přesměrovávám…' : cards.length > 0 ? 'Uložit jinou kartu' : 'Uložit kartu'}
      </button>
    </section>
  );
}
