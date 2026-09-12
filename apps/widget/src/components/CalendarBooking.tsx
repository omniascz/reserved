'use client';

// CalendarBooking (sprint 10.18) — vkládací měsíční kalendář dostupnosti.
// Embed na cizí web přes embed.js (data-view="calendar"). Měsíční mřížka
// obarvená dle dostupnosti → klik na den → volné časy → kontakt → rezervace.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  confirmBooking,
  createHold,
  getAvailability,
  getAvailableDays,
  listServices,
  ReservedApiError,
  type PublicService,
} from '@/lib/api';
import { useLang, useT } from '@/i18n/I18nProvider';
import { formatTime, todayInPrague } from '@/lib/format';

const WEEKDAYS: Record<string, string[]> = {
  cs: ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface DaySlot {
  startsAt: string;
  employeeId: string;
}

export function CalendarBooking({
  slug,
  presetServiceId,
}: {
  slug: string;
  presetServiceId?: string;
}) {
  const t = useT();
  const lang = useLang();
  const today = todayInPrague();

  const [services, setServices] = useState<PublicService[]>([]);
  const [serviceId, setServiceId] = useState<string>(presetServiceId ?? '');
  const [month, setMonth] = useState<string>(() => today.slice(0, 7));
  const [days, setDays] = useState<Record<string, number>>({});
  const [loadingDays, setLoadingDays] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySlots, setDaySlots] = useState<DaySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Rezervační krok: vybraný slot → hold → kontakt → potvrzení.
  const [pending, setPending] = useState<DaySlot | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    listServices(slug)
      .then((svc) => {
        setServices(svc);
        if (!presetServiceId && svc.length === 1) setServiceId(svc[0]!.id);
      })
      .catch(() => undefined);
  }, [slug, presetServiceId]);

  const loadDays = useCallback(() => {
    if (!serviceId) return;
    setLoadingDays(true);
    setError(null);
    getAvailableDays(slug, serviceId, month)
      .then((list) => setDays(Object.fromEntries(list.map((d) => [d.date, d.slotCount]))))
      .catch((e) => setError(e instanceof ReservedApiError ? e.message : t('calendar.error')))
      .finally(() => setLoadingDays(false));
  }, [slug, serviceId, month, t]);

  useEffect(() => {
    setSelectedDate(null);
    setDaySlots([]);
    loadDays();
  }, [loadDays]);

  function pickDay(date: string): void {
    if (!serviceId || (days[date] ?? 0) <= 0 || date < today) return;
    setSelectedDate(date);
    setPending(null);
    setDone(false);
    setLoadingSlots(true);
    getAvailability(slug, serviceId, date)
      .then((perEmp) => {
        const flat: DaySlot[] = [];
        for (const emp of perEmp) {
          for (const s of emp.slots)
            flat.push({ startsAt: s.startsAt, employeeId: emp.employeeId });
        }
        flat.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        setDaySlots(flat);
      })
      .catch((e) => setError(e instanceof ReservedApiError ? e.message : t('calendar.error')))
      .finally(() => setLoadingSlots(false));
  }

  async function pickSlot(slot: DaySlot): Promise<void> {
    setError(null);
    try {
      const hold = await createHold(slug, {
        serviceId,
        employeeId: slot.employeeId,
        startsAt: slot.startsAt,
      });
      setPending(slot);
      setSessionToken(hold.sessionToken);
    } catch (e) {
      setError(e instanceof ReservedApiError ? e.message : t('calendar.error'));
    }
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!sessionToken) return;
    setSubmitting(true);
    setError(null);
    try {
      await confirmBooking(slug, {
        sessionToken,
        customerName: name,
        customerEmail: email,
        customerPhone: phone || null,
      });
      setDone(true);
      setPending(null);
      setSessionToken(null);
      loadDays();
    } catch (e2) {
      setError(e2 instanceof ReservedApiError ? e2.message : t('calendar.error'));
    } finally {
      setSubmitting(false);
    }
  }

  // Mřížka měsíce (pondělí první).
  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const firstDow = (new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    const arr: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push({ date: `${month}-${String(d).padStart(2, '0')}`, day: d });
    }
    return arr;
  }, [month]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'cs-CZ', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Prague',
    }).format(new Date(Date.UTC(y!, m! - 1, 1)));
  }, [month, lang]);

  const weekdays = WEEKDAYS[lang] ?? WEEKDAYS.cs!;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('calendar.title')}</h2>

      {/* Výběr služby (skryje se, pokud je předvybraná nebo jediná). */}
      {!presetServiceId && services.length !== 1 && (
        <div>
          {services.length === 0 ? (
            <p className="text-slate-400">{t('calendar.noService')}</p>
          ) : (
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t('calendar.pickService')}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {serviceId && (
        <>
          {/* Hlavička měsíce */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              {t('calendar.prevMonth')}
            </button>
            <span className="font-semibold capitalize">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              {t('calendar.nextMonth')}
            </button>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          {loadingDays && (
            <p className="text-slate-400 text-center py-4">{t('calendar.loading')}</p>
          )}

          {/* Mřížka */}
          {!loadingDays && (
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {weekdays.map((w) => (
                <div key={w} className="font-semibold text-slate-500 text-xs py-1">
                  {w}
                </div>
              ))}
              {cells.map((c, i) => {
                if (!c) return <div key={`b${i}`} />;
                const count = days[c.date] ?? 0;
                const isPast = c.date < today;
                const free = count > 0 && !isPast;
                const selected = selectedDate === c.date;
                return (
                  <button
                    key={c.date}
                    type="button"
                    disabled={!free}
                    onClick={() => pickDay(c.date)}
                    className={`aspect-square rounded-lg text-sm flex items-center justify-center ${
                      selected
                        ? 'bg-brand-600 text-white font-bold'
                        : free
                          ? 'bg-brand-50 text-brand-700 hover:bg-brand-100 font-semibold'
                          : 'text-slate-300'
                    }`}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>
          )}

          {/* Časy vybraného dne */}
          {selectedDate && !done && (
            <div className="border-t border-slate-200 pt-3">
              {loadingSlots ? (
                <p className="text-slate-400 text-center py-2">{t('calendar.loading')}</p>
              ) : daySlots.length === 0 ? (
                <p className="text-slate-400 text-center py-2">{t('calendar.noSlots')}</p>
              ) : !pending ? (
                <>
                  <p className="text-sm font-semibold mb-2">{t('calendar.times')}</p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => (
                      <button
                        key={`${s.startsAt}-${s.employeeId}`}
                        type="button"
                        onClick={() => pickSlot(s)}
                        className="px-3 py-1.5 rounded-lg border border-brand-300 text-brand-700 text-sm hover:bg-brand-50"
                      >
                        {formatTime(s.startsAt)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <form onSubmit={submit} className="space-y-2 max-w-sm">
                  <p className="text-sm font-semibold">{formatTime(pending.startsAt)}</p>
                  <input
                    type="text"
                    required
                    placeholder={t('contact.name')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="email"
                    required
                    placeholder={t('contact.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="tel"
                    placeholder={t('contact.phone')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPending(null);
                        setSessionToken(null);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    >
                      {t('calendar.back')}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 px-3 py-2 rounded-lg bg-brand-600 text-white font-semibold text-sm disabled:opacity-60"
                    >
                      {submitting ? t('contact.submitting') : t('contact.submit')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {done && (
            <div className="border-t border-slate-200 pt-3">
              <p className="text-green-700 font-semibold">✓ {t('calendar.booked')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
