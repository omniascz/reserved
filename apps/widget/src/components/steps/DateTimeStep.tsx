'use client';

import { useEffect, useState } from 'react';
import {
  createHold,
  getAvailability,
  type AvailabilityForEmployee,
  type AvailableSlot,
  type HoldResult,
  type PublicEmployee,
  type PublicService,
  ReservedApiError,
} from '@/lib/api';
import { addDays, formatDate, formatTime, todayInPrague } from '@/lib/format';

export function DateTimeStep({
  slug,
  service,
  employee,
  onPick,
  onBack,
}: {
  slug: string;
  service: PublicService;
  employee: PublicEmployee;
  onPick: (slot: AvailableSlot, hold: HoldResult) => void;
  onBack: () => void;
}) {
  const [date, setDate] = useState<string>(todayInPrague());
  const [availability, setAvailability] = useState<AvailabilityForEmployee[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAvailability(slug, service.id, date, employee.id)
      .then((data) => setAvailability(data))
      .catch((e) => setError(e?.message ?? 'Chyba'))
      .finally(() => setLoading(false));
  }, [slug, service.id, employee.id, date]);

  async function pickSlot(slot: AvailableSlot) {
    setLocking(slot.startsAt);
    setError(null);
    try {
      const hold = await createHold(slug, {
        serviceId: service.id,
        employeeId: employee.id,
        startsAt: slot.startsAt,
      });
      onPick(slot, hold);
    } catch (e) {
      if (e instanceof ReservedApiError && e.code === 'SLOT_TAKEN') {
        setError('Tento termín už si někdo zarezervoval. Vyber jiný.');
        // Refresh availability
        getAvailability(slug, service.id, date, employee.id).then(setAvailability);
      } else {
        setError(e instanceof Error ? e.message : 'Chyba při rezervaci');
      }
    } finally {
      setLocking(null);
    }
  }

  const slots = availability?.[0]?.slots ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Vyber termín</h2>
          <p className="text-sm text-slate-500 mt-1">
            {service.name} · {employee.displayName ?? `${employee.firstName} ${employee.lastName}`}
          </p>
        </div>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900">
          ← Zpět
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setDate(addDays(date, -1))}
          className="p-2 hover:bg-slate-100 rounded"
          aria-label="Předchozí den"
        >
          ←
        </button>
        <input
          type="date"
          value={date}
          min={todayInPrague()}
          onChange={(ev) => setDate(ev.target.value)}
          className="border border-slate-300 rounded px-3 py-1.5 flex-1 sm:flex-none"
        />
        <button
          onClick={() => setDate(addDays(date, 1))}
          className="p-2 hover:bg-slate-100 rounded"
          aria-label="Další den"
        >
          →
        </button>
        <div className="ml-2 text-slate-500 hidden md:block">{formatDate(date + 'T00:00:00Z')}</div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 py-8 text-center">Načítám termíny…</div>
      ) : slots.length === 0 ? (
        <div className="text-slate-500 py-8 text-center">
          Pro tento den nejsou žádné volné termíny. Vyber jiný den.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {slots.map((s) => (
            <button
              key={s.startsAt}
              onClick={() => pickSlot(s)}
              disabled={locking !== null}
              className="px-3 py-2 border border-slate-200 rounded-lg text-center hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50 transition"
            >
              <span className="font-semibold">{formatTime(s.startsAt)}</span>
              {locking === s.startsAt && (
                <span className="block text-xs text-brand-600">zamykám…</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
