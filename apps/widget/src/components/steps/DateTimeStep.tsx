'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import {
  createHold,
  getAvailability,
  isAbortError,
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
  const t = useT();
  const [date, setDate] = useState<string>(todayInPrague());
  const [availability, setAvailability] = useState<AvailabilityForEmployee[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState<string | null>(null);

  // Dodatečné načtení po SLOT_TAKEN běží mimo efekt, takže si ho držíme zvlášť
  // a rušíme ho při každé změně dne — jinak by jeho opožděná odpověď přepsala
  // termíny jiného dne.
  const refreshRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Každá změna dne zruší předchozí požadavek. Bez toho může starší odpověď
    // dorazit jako poslední a přepsat termíny nově vybraného dne — zákazník pak
    // vidí prázdno u dne, který volno má.
    const ac = new AbortController();
    refreshRef.current?.abort();
    setLoading(true);
    setError(null);
    getAvailability(slug, service.id, date, employee.id, ac.signal)
      .then((data) => setAvailability(data))
      .catch((e) => {
        if (isAbortError(e)) return; // zrušili jsme ho sami, není to chyba
        setError(e?.message ?? t('contact.genericError'));
      })
      .finally(() => {
        // Zrušený požadavek už nesmí sahat na "načítám" — běží novější.
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [slug, service.id, employee.id, date, t]);

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
      if (e instanceof ReservedApiError && e.code === 'TENANT_EMAIL_UNVERIFIED') {
        // Zamknutí termínu je první místo, kde se blokace projeví.
        setError(t('common.tenantUnverified'));
      } else if (e instanceof ReservedApiError && e.code === 'SLOT_TAKEN') {
        setError(t('datetime.slotTaken'));
        // Obnovit nabídku termínů — ale tak, aby ji šlo zrušit při změně dne.
        refreshRef.current?.abort();
        const ac = new AbortController();
        refreshRef.current = ac;
        getAvailability(slug, service.id, date, employee.id, ac.signal)
          .then((data) => {
            if (!ac.signal.aborted) setAvailability(data);
          })
          .catch(() => undefined);
      } else {
        setError(e instanceof Error ? e.message : t('datetime.bookingError'));
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
          <h2 className="text-xl font-bold">{t('datetime.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {service.name} · {employee.displayName ?? `${employee.firstName} ${employee.lastName}`}
          </p>
        </div>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900">
          {t('common.back')}
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setDate(addDays(date, -1))}
          className="p-2 hover:bg-slate-100 rounded"
          aria-label={t('datetime.prevDay')}
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
          aria-label={t('datetime.nextDay')}
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
        <div className="text-slate-400 py-8 text-center">{t('datetime.loading')}</div>
      ) : slots.length === 0 ? (
        <div className="text-slate-500 py-8 text-center">{t('datetime.noSlots')}</div>
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
                <span className="block text-xs text-brand-600">{t('datetime.locking')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
