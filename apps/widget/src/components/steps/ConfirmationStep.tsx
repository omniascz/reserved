'use client';

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
  return (
    <div className="text-center space-y-6 py-4">
      <div className="text-6xl">✅</div>
      <div>
        <h2 className="text-2xl font-bold">Rezervace potvrzena</h2>
        <p className="text-slate-600 mt-2">
          Děkujeme za rezervaci v {tenantName}. Potvrzení jsme ti poslali emailem.
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 max-w-md mx-auto text-left">
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-slate-500">Číslo rezervace</dt>
            <dd className="font-mono font-semibold">{confirmation.referenceCode}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Den</dt>
            <dd className="font-semibold">{formatDate(confirmation.startsAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Čas</dt>
            <dd className="font-semibold">
              {formatTime(confirmation.startsAt)} – {formatTime(confirmation.endsAt)}
            </dd>
          </div>
        </dl>
      </div>

      <button onClick={onNew} className="text-brand-600 hover:text-brand-700 font-semibold">
        Vytvořit další rezervaci
      </button>
    </div>
  );
}
