'use client';

import { useT } from '@/i18n/I18nProvider';
import type { BookingConfirmation } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';

export function ConfirmationStep({
  confirmation,
  tenantName,
  onNew,
}: {
  confirmation: BookingConfirmation;
  tenantName: string;
  onNew: () => void;
}) {
  const t = useT();
  return (
    <div className="text-center space-y-6 py-4">
      <div className="text-6xl">✅</div>
      <div>
        <h2 className="text-2xl font-bold">{t('confirm.title')}</h2>
        <p className="text-slate-600 mt-2">{t('confirm.thanks', { tenant: tenantName })}</p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 max-w-md mx-auto text-left">
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-slate-500">{t('confirm.reference')}</dt>
            <dd className="font-mono font-semibold">{confirmation.referenceCode}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">{t('confirm.day')}</dt>
            <dd className="font-semibold">{formatDate(confirmation.startsAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">{t('confirm.time')}</dt>
            <dd className="font-semibold">
              {formatTime(confirmation.startsAt)} – {formatTime(confirmation.endsAt)}
            </dd>
          </div>
        </dl>
      </div>

      <button onClick={onNew} className="text-brand-600 hover:text-brand-700 font-semibold">
        {t('confirm.newBooking')}
      </button>
    </div>
  );
}
