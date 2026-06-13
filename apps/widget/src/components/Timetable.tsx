'use client';

// Timetable (sprint 10.17) — vkládací týdenní rozvrh skupinových lekcí.
// Embed na cizí web přes embed.js (data-view="timetable"). Živá volná místa,
// přihlášení i pořadník (waitlist) přímo z mřížky.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  joinClassSession,
  joinClassWaitlist,
  listAllClassSessions,
  listServices,
  ReservedApiError,
  type PublicClassSession,
} from '@/lib/api';
import { useLang, useT } from '@/i18n/I18nProvider';
import { addDays, formatTime, todayInPrague } from '@/lib/format';

const DAY_LABELS: Record<string, string[]> = {
  cs: ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

/** Pondělí týdne pro dané ISO datum (YYYY-MM-DD). */
function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Ne..6=So
  const sinceMonday = (dow + 6) % 7;
  return addDays(iso, -sinceMonday);
}

function pragueDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date(iso));
}

export function Timetable({ slug }: { slug: string }) {
  const t = useT();
  const lang = useLang();

  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(todayInPrague()));
  const [sessions, setSessions] = useState<PublicClassSession[]>([]);
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    session: PublicClassSession;
    mode: 'join' | 'waitlist';
  } | null>(null);

  useEffect(() => {
    listServices(slug)
      .then((svc) => setServiceNames(Object.fromEntries(svc.map((s) => [s.id, s.name]))))
      .catch(() => undefined);
  }, [slug]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    const from = `${weekStart}T00:00:00.000Z`;
    const to = `${addDays(weekStart, 7)}T00:00:00.000Z`;
    listAllClassSessions(slug, { from, to })
      .then(setSessions)
      .catch((e) => setError(e instanceof ReservedApiError ? e.message : t('timetable.error')))
      .finally(() => setLoading(false));
  }, [slug, weekStart, t]);

  useEffect(() => reload(), [reload]);

  const byDay = useMemo(() => {
    const groups: PublicClassSession[][] = [[], [], [], [], [], [], []];
    const base = Date.parse(`${weekStart}T00:00:00Z`);
    for (const s of sessions) {
      const idx = Math.round(
        (Date.parse(`${pragueDay(s.startsAt)}T00:00:00Z`) - base) / 86_400_000,
      );
      if (idx >= 0 && idx < 7) groups[idx]!.push(s);
    }
    groups.forEach((g) => g.sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    return groups;
  }, [sessions, weekStart]);

  const labels = DAY_LABELS[lang] ?? DAY_LABELS.cs!;
  const hasAny = sessions.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{t('timetable.title')}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
          >
            {t('timetable.prev')}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(todayInPrague()))}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
          >
            {t('timetable.thisWeek')}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
          >
            {t('timetable.next')}
          </button>
        </div>
      </div>

      {loading && <p className="text-slate-400 py-8 text-center">{t('timetable.loading')}</p>}
      {error && <p className="text-red-600 py-4 text-center">{error}</p>}
      {!loading && !error && !hasAny && (
        <p className="text-slate-400 py-8 text-center">{t('timetable.empty')}</p>
      )}

      {!loading && !error && hasAny && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {byDay.map((daySessions, idx) => {
            const dayIso = addDays(weekStart, idx);
            const dayNum = new Date(`${dayIso}T00:00:00Z`).getUTCDate();
            return (
              <div key={dayIso} className="space-y-2">
                <div className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1">
                  {labels[idx]} {dayNum}.
                </div>
                {daySessions.length === 0 && <div className="text-xs text-slate-300">—</div>}
                {daySessions.map((s) => {
                  const full = s.freeSpots <= 0;
                  return (
                    <div
                      key={s.id}
                      className="rounded-lg border border-slate-200 p-2 text-sm bg-white"
                    >
                      <div className="font-semibold">{formatTime(s.startsAt)}</div>
                      <div className="text-slate-700">{serviceNames[s.serviceId] ?? '—'}</div>
                      <div className={`text-xs mt-0.5 ${full ? 'text-red-600' : 'text-slate-500'}`}>
                        {full ? t('timetable.full') : `${s.freeSpots} ${t('timetable.spots')}`}
                      </div>
                      <button
                        type="button"
                        onClick={() => setModal({ session: s, mode: full ? 'waitlist' : 'join' })}
                        className={`mt-2 w-full px-2 py-1.5 rounded-md text-xs font-semibold text-white ${
                          full
                            ? 'bg-slate-500 hover:bg-slate-600'
                            : 'bg-brand-600 hover:bg-brand-700'
                        }`}
                      >
                        {full ? t('timetable.waitlist') : t('timetable.book')}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <JoinModal
          slug={slug}
          session={modal.session}
          mode={modal.mode}
          serviceName={serviceNames[modal.session.serviceId] ?? ''}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function JoinModal({
  slug,
  session,
  mode,
  serviceName,
  onClose,
  onDone,
}: {
  slug: string;
  session: PublicClassSession;
  mode: 'join' | 'waitlist';
  serviceName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<'join' | 'waitlist' | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const input = { customerName: name, customerEmail: email, customerPhone: phone || null };
      if (mode === 'waitlist') {
        await joinClassWaitlist(slug, session.id, input);
        setDone('waitlist');
      } else {
        await joinClassSession(slug, session.id, input);
        setDone('join');
      }
    } catch (e2) {
      setErr(e2 instanceof ReservedApiError ? e2.message : t('timetable.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-sm w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold">
          {mode === 'waitlist' ? t('timetable.waitlistTitle') : t('timetable.joinTitle')}
        </h3>
        <p className="text-sm text-slate-600">
          {serviceName} · {formatTime(session.startsAt)}
        </p>

        {done ? (
          <div className="space-y-3">
            <p className="text-green-700 text-sm">
              {done === 'waitlist' ? t('timetable.waitlisted') : t('timetable.joined')}
            </p>
            <button
              type="button"
              onClick={onDone}
              className="w-full px-3 py-2 rounded-lg bg-brand-600 text-white font-semibold"
            >
              OK
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2">
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
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                {t('timetable.cancel')}
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
    </div>
  );
}
