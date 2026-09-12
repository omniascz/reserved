'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import {
  listClassSessions,
  joinClassSession,
  type BookingConfirmation,
  type PublicClassSession,
  type PublicService,
  ReservedApiError,
} from '@/lib/api';
import { formatDate, formatTime, formatPrice } from '@/lib/format';

// Sprint 10.0 — krok pro skupinové lekce (služby s capacity > 1).
// Vybere lekci ze seznamu otevřených termínů, vyplní kontakt a přihlásí se.
export function ClassSessionStep({
  slug,
  service,
  tenantName,
  onConfirm,
  onBack,
}: {
  slug: string;
  service: PublicService;
  tenantName: string;
  onConfirm: (confirmation: BookingConfirmation) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [sessions, setSessions] = useState<PublicClassSession[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PublicClassSession | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClassSessions(slug, service.id)
      .then(setSessions)
      .catch((e) => {
        setSessions([]);
        setLoadError(e instanceof Error ? e.message : 'Nepodařilo se načíst lekce.');
      });
  }, [slug, service.id]);

  useEffect(() => {
    setError(null);
  }, [name, email, phone]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await joinClassSession(slug, selected.id, {
        customerName: name,
        customerEmail: email,
        customerPhone: phone || null,
        customerNote: note || null,
      });
      onConfirm(data);
    } catch (e) {
      if (e instanceof ReservedApiError) {
        if (e.code === 'SESSION_FULL') {
          setError('Tato lekce se mezitím zaplnila. Vyber prosím jiný termín.');
        } else if (e.code === 'ALREADY_JOINED') {
          setError('Na tuto lekci už jsi přihlášený/á.');
        } else {
          setError(e.message);
        }
      } else {
        setError(e instanceof Error ? e.message : t('contact.genericError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sessions === null) {
    return <div className="text-slate-400">{t('loading')}</div>;
  }

  // ─── Výběr termínu lekce ─────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">Vyber termín lekce</h2>
            <p className="text-sm text-slate-500">{service.name}</p>
          </div>
          <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900">
            {t('common.back')}
          </button>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
            {loadError}
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">
            Pro tuto lekci nejsou vypsané žádné volné termíny.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className="w-full text-left border border-slate-200 rounded-lg p-4 hover:border-brand-500 hover:bg-brand-50 transition flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-slate-900">{formatDate(s.startsAt)}</div>
                  <div className="text-sm text-slate-600">
                    {formatTime(s.startsAt)} – {formatTime(s.endsAt)}
                    {s.employeeName ? ` · ${s.employeeName}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-emerald-700">
                    {s.freeSpots} {volnaMista(s.freeSpots)}
                  </div>
                  <div className="text-slate-900 font-bold mt-0.5">
                    {formatPrice(service.priceHellers, service.currency)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Kontaktní formulář + přihlášení ─────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-bold">{t('contact.title')}</h2>
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          {t('common.back')}
        </button>
      </div>

      <div className="bg-brand-50 border border-brand-100 rounded-lg p-4 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">{tenantName}</div>
            <div className="text-slate-600">{service.name}</div>
            {selected.employeeName && <div className="text-slate-600">{selected.employeeName}</div>}
          </div>
          <div className="text-right">
            <div className="font-semibold">{formatDate(selected.startsAt)}</div>
            <div className="text-slate-700">
              {formatTime(selected.startsAt)} – {formatTime(selected.endsAt)}
            </div>
            <div className="text-slate-900 font-bold mt-1">
              {formatPrice(service.priceHellers, service.currency)}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="cs-name">
            {t('contact.name')}
          </label>
          <input
            id="cs-name"
            type="text"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="cs-email">
            {t('contact.email')}
          </label>
          <input
            id="cs-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="cs-phone">
            {t('contact.phone')}
          </label>
          <input
            id="cs-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+420 …"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="cs-note">
            {t('contact.note')}
          </label>
          <textarea
            id="cs-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting ? t('contact.submitting') : t('contact.submit')}
        </button>

        <p className="text-xs text-slate-500 text-center">{t('contact.gdpr')}</p>
      </form>
    </div>
  );
}

/** České skloňování: 1 místo / 2–4 místa / 5+ míst. */
function volnaMista(n: number): string {
  if (n === 1) return 'volné místo';
  if (n >= 2 && n <= 4) return 'volná místa';
  return 'volných míst';
}
