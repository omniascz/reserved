'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getAvailability,
  rescheduleMyBooking,
  type AvailabilityForEmployee,
  type PortalBooking,
} from '@/lib/api';

export function RescheduleModal({
  booking,
  onClose,
  onSuccess,
}: {
  booking: PortalBooking;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [availability, setAvailability] = useState<AvailabilityForEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAvailability(booking.serviceId, selectedDate);
      setAvailability(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }, [booking, selectedDate]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handlePick(slot: { startsAt: string }) {
    if (
      !window.confirm(
        `Přesunout rezervaci na ${new Date(slot.startsAt).toLocaleString('cs-CZ', {
          timeZone: 'Europe/Prague',
        })}?`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await rescheduleMyBooking(booking.id, slot.startsAt);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 my-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold">Přesunout rezervaci</h2>
            <p className="text-sm text-slate-500">
              {booking.serviceName} · původně{' '}
              {new Date(booking.startsAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl">
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Vyber datum</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={today}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>

        {loading ? (
          <div className="text-slate-400 text-center py-8">Načítám termíny…</div>
        ) : availability.length === 0 ? (
          <div className="text-slate-500 text-center py-8">
            Žádné volné termíny pro vybrané datum. Zkus jiný den.
          </div>
        ) : (
          <div className="space-y-3">
            {availability.map((emp) => (
              <div key={emp.employeeId} className="border border-slate-200 rounded-lg p-3">
                <div className="font-medium text-sm mb-2">{emp.employeeName}</div>
                {emp.slots.length === 0 ? (
                  <div className="text-xs text-slate-400">Žádné volné termíny</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {emp.slots.map((s) => (
                      <button
                        key={s.startsAt}
                        onClick={() => handlePick(s)}
                        disabled={submitting}
                        className="px-3 py-1.5 text-sm bg-brand-50 text-brand-700 hover:bg-brand-100 rounded font-medium disabled:opacity-50"
                      >
                        {new Date(s.startsAt).toLocaleTimeString('cs-CZ', {
                          timeZone: 'Europe/Prague',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
