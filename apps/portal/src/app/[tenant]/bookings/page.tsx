'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PortalHeader } from '@/components/PortalHeader';
import {
  cancelMyBooking,
  formatDateTime,
  formatPrice,
  getAccessToken,
  listMyBookings,
  PortalApiError,
  type PortalBooking,
} from '@/lib/api';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Potvrzeno', color: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Čeká na potvrzení', color: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Zrušeno', color: 'bg-red-100 text-red-700' },
  completed: { label: 'Dokončeno', color: 'bg-slate-200 text-slate-700' },
  no_show: { label: 'Nedorazil/a', color: 'bg-orange-100 text-orange-700' },
};

export default function BookingsPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/${tenant}/login`);
      return;
    }
  }, [tenant, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMyBookings();
      setBookings(data);
    } catch (e) {
      if (e instanceof PortalApiError && (e.status === 401 || e.status === 403)) {
        router.replace(`/${tenant}/login`);
        return;
      }
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }, [tenant, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCancel(b: PortalBooking) {
    const ok = window.confirm(`Zrušit rezervaci ${b.serviceName} (${formatDateTime(b.startsAt)})?`);
    if (!ok) return;
    setCancellingId(b.id);
    setError(null);
    try {
      await cancelMyBooking(b.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setCancellingId(null);
    }
  }

  const now = Date.now();
  const upcoming = bookings.filter(
    (b) => new Date(b.startsAt).getTime() >= now && b.status !== 'cancelled',
  );
  const past = bookings.filter(
    (b) => new Date(b.startsAt).getTime() < now || b.status === 'cancelled',
  );

  return (
    <div className="min-h-screen flex flex-col">
      <PortalHeader />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-1">Moje rezervace</h1>
        <p className="text-sm text-slate-500 mb-6">
          Tady vidíš všechny své termíny. Můžeš je zrušit nebo přesunout, pokud je čas.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading && <div className="text-slate-500">Načítám…</div>}

        {!loading && (
          <>
            <Section title={`Nadcházející (${upcoming.length})`}>
              {upcoming.length === 0 ? (
                <Empty>Aktuálně žádné nadcházející rezervace.</Empty>
              ) : (
                upcoming.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    isCancelling={cancellingId === b.id}
                    onCancel={() => handleCancel(b)}
                    canModify
                  />
                ))
              )}
            </Section>

            <Section title={`Historie (${past.length})`}>
              {past.length === 0 ? (
                <Empty>Zatím žádná historie.</Empty>
              ) : (
                past
                  .slice(0, 20)
                  .map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      isCancelling={false}
                      onCancel={() => {}}
                      canModify={false}
                    />
                  ))
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-semibold text-slate-700 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500">
      {children}
    </div>
  );
}

function BookingCard({
  booking,
  isCancelling,
  onCancel,
  canModify,
}: {
  booking: PortalBooking;
  isCancelling: boolean;
  onCancel: () => void;
  canModify: boolean;
}) {
  const status = STATUS_LABELS[booking.status] ?? { label: booking.status, color: 'bg-slate-100' };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div
        className="w-1 sm:w-2 h-12 sm:h-16 rounded-full flex-shrink-0"
        style={{ backgroundColor: booking.serviceColor ?? '#3b82f6' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="font-semibold">{booking.serviceName ?? 'Rezervace'}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
            {status.label}
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1">{formatDateTime(booking.startsAt)}</p>
        {booking.employeeName && (
          <p className="text-sm text-slate-500">U: {booking.employeeName}</p>
        )}
        <p className="text-xs text-slate-400 mt-1">
          Ref: {booking.referenceCode} · {formatPrice(booking.pricePaidHellers, booking.currency)}
        </p>
      </div>
      {canModify && booking.status !== 'cancelled' && (
        <div className="flex gap-2 sm:flex-col">
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="text-sm px-3 py-1.5 border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
          >
            {isCancelling ? 'Ruším…' : 'Zrušit'}
          </button>
        </div>
      )}
    </div>
  );
}
