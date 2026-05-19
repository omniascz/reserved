'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import {
  confirmBooking,
  type AvailableSlot,
  type BookingConfirmation,
  type HoldResult,
  type PublicEmployee,
  type PublicService,
  ReservedApiError,
} from '@/lib/api';
import { formatDate, formatTime, formatPrice } from '@/lib/format';
import { CountdownTimer } from '../CountdownTimer';

export function ContactStep({
  slug,
  service,
  employee,
  slot,
  hold,
  tenantName,
  onConfirm,
  onBack,
}: {
  slug: string;
  service: PublicService;
  employee: PublicEmployee;
  slot: AvailableSlot;
  hold: HoldResult;
  tenantName: string;
  onConfirm: (confirmation: BookingConfirmation) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setError(null);
  }, [name, email, phone]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (expired) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await confirmBooking(slug, {
        sessionToken: hold.sessionToken,
        customerName: name,
        customerEmail: email,
        customerPhone: phone || null,
        customerNote: note || null,
      });
      onConfirm(data);
    } catch (e) {
      if (e instanceof ReservedApiError) {
        if (e.code === 'HOLD_EXPIRED') {
          setExpired(true);
          setError(t('contact.holdExpired'));
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-bold">{t('contact.title')}</h2>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900">
          {t('common.back')}
        </button>
      </div>

      <div className="bg-brand-50 border border-brand-100 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">{tenantName}</div>
            <div className="text-slate-600">{service.name}</div>
            <div className="text-slate-600">
              {employee.displayName ?? `${employee.firstName} ${employee.lastName}`}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold">{formatDate(slot.startsAt)}</div>
            <div className="text-slate-700">
              {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
            </div>
            <div className="text-slate-900 font-bold mt-1">
              {formatPrice(service.priceHellers, service.currency)}
            </div>
          </div>
        </div>
        <CountdownTimer expiresAt={hold.expiresAt} onExpire={() => setExpired(true)} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="name">
            {t('contact.name')}
          </label>
          <input
            id="name"
            type="text"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
            {t('contact.email')}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="phone">
            {t('contact.phone')}
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+420 …"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="note">
            {t('contact.note')}
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || expired}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting ? t('contact.submitting') : t('contact.submit')}
        </button>

        <p className="text-xs text-slate-500 text-center">{t('contact.gdpr')}</p>
      </form>
    </div>
  );
}
