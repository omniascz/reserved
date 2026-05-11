'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core';
import {
  AdminApiError,
  cancelBooking,
  clearAuth,
  getAccessToken,
  getTenantSlug,
  listBookings,
  listEmployees,
  listServices,
  rescheduleBooking,
  type AdminBooking,
  type AdminEmployee,
  type AdminService,
} from '@/lib/api';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    booking: AdminBooking;
    service?: AdminService;
    employee?: AdminEmployee;
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#fbbf24',
  confirmed: '#3b82f6',
  completed: '#10b981',
  cancelled: '#94a3b8',
  no_show: '#ef4444',
};

export default function CalendarPage() {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const [services, setServices] = useState<AdminService[]>([]);
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  // ─── Auth check on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  // ─── Load services & employees once ─────────────────────────────────
  useEffect(() => {
    Promise.all([listServices(), listEmployees()])
      .then(([svc, emp]) => {
        setServices(svc);
        setEmployees(emp);
      })
      .catch((e) => {
        if (e instanceof AdminApiError && e.status === 401) {
          clearAuth();
          router.replace('/login');
        } else {
          setError(e?.message ?? 'Chyba');
        }
      });
  }, [router]);

  // ─── Reload bookings when range changes ─────────────────────────────
  const reload = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      setError(null);
      try {
        const bookings = await listBookings({ from, to });
        const evts: CalendarEvent[] = bookings.map((b) => {
          const service = services.find((s) => s.id === b.serviceId);
          const employee = employees.find((e) => e.id === b.employeeId);
          const color = STATUS_COLORS[b.status] ?? '#64748b';
          return {
            id: b.id,
            title: `${service?.name ?? 'Služba'} — ${b.customerName}`,
            start: b.startsAt,
            end: b.endsAt,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { booking: b, service, employee },
          };
        });
        setEvents(evts);
      } catch (e) {
        if (e instanceof AdminApiError && e.status === 401) {
          clearAuth();
          router.replace('/login');
        } else {
          setError(e instanceof Error ? e.message : 'Chyba');
        }
      } finally {
        setLoading(false);
      }
    },
    [services, employees, router],
  );

  useEffect(() => {
    if (range && services.length > 0) {
      reload(range.from, range.to);
    }
  }, [range, services.length, employees.length, reload]);

  function handleDatesSet(arg: DatesSetArg) {
    setRange({
      from: arg.startStr,
      to: arg.endStr,
    });
  }

  function handleEventClick(arg: EventClickArg) {
    setSelectedBooking(arg.event.extendedProps.booking as AdminBooking);
  }

  async function handleEventDrop(arg: EventDropArg) {
    const newStart = arg.event.start;
    if (!newStart) {
      arg.revert();
      return;
    }
    try {
      await rescheduleBooking(arg.event.id, newStart.toISOString());
      // Optimistic update — refresh from server
      if (range) await reload(range.from, range.to);
    } catch (e) {
      arg.revert();
      setError(e instanceof Error ? e.message : 'Přesun selhal');
    }
  }

  async function handleCancel() {
    if (!selectedBooking) return;
    const reason = window.prompt('Důvod zrušení (volitelně):') ?? '';
    try {
      await cancelBooking(selectedBooking.id, reason);
      setSelectedBooking(null);
      if (range) await reload(range.from, range.to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Zrušení selhalo');
    }
  }

  function handleLogout() {
    clearAuth();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold">Reserved Admin</h1>
          <span className="text-sm text-slate-500">salon: {getTenantSlug()}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <LegendDot color={STATUS_COLORS.pending!} label="Čeká" />
          <LegendDot color={STATUS_COLORS.confirmed!} label="Potvrzeno" />
          <LegendDot color={STATUS_COLORS.completed!} label="Dokončeno" />
          <LegendDot color={STATUS_COLORS.cancelled!} label="Zrušeno" />
          <LegendDot color={STATUS_COLORS.no_show!} label="Nepřišel" />
          <button onClick={handleLogout} className="ml-3 text-slate-500 hover:text-slate-900">
            Odhlásit
          </button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 relative">
          {loading && <div className="absolute top-2 right-4 text-xs text-slate-400">načítám…</div>}
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            buttonText={{
              today: 'Dnes',
              month: 'Měsíc',
              week: 'Týden',
              day: 'Den',
            }}
            locale="cs"
            firstDay={1}
            allDaySlot={false}
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            height="auto"
            events={events}
            editable
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
          />
        </div>
      </main>

      {selectedBooking && (
        <BookingModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onCancel={handleCancel}
          services={services}
          employees={employees}
        />
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-600">
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function BookingModal({
  booking,
  onClose,
  onCancel,
  services,
  employees,
}: {
  booking: AdminBooking;
  onClose: () => void;
  onCancel: () => void;
  services: AdminService[];
  employees: AdminEmployee[];
}) {
  const service = services.find((s) => s.id === booking.serviceId);
  const employee = employees.find((e) => e.id === booking.employeeId);
  const price = (booking.pricePaidHellers / 100).toLocaleString('cs-CZ');

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">{service?.name ?? 'Rezervace'}</h2>
            <p className="text-sm text-slate-500 font-mono">{booking.referenceCode}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl">
            ×
          </button>
        </div>

        <dl className="space-y-2 text-sm">
          <Row label="Zákazník" value={booking.customerName} />
          <Row label="Email" value={booking.customerEmail} />
          {booking.customerPhone && <Row label="Telefon" value={booking.customerPhone} />}
          {employee && (
            <Row
              label="Zaměstnanec"
              value={employee.displayName ?? `${employee.firstName} ${employee.lastName}`}
            />
          )}
          <Row
            label="Začátek"
            value={new Date(booking.startsAt).toLocaleString('cs-CZ', {
              timeZone: 'Europe/Prague',
            })}
          />
          <Row
            label="Konec"
            value={new Date(booking.endsAt).toLocaleString('cs-CZ', {
              timeZone: 'Europe/Prague',
            })}
          />
          <Row label="Cena" value={`${price} ${booking.currency}`} />
          <Row label="Stav" value={booking.status} />
          {booking.customerNote && <Row label="Poznámka klienta" value={booking.customerNote} />}
        </dl>

        <div className="flex justify-end gap-2 mt-6">
          {booking.status !== 'cancelled' && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded font-medium"
            >
              Zrušit rezervaci
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-medium"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 text-right">{value}</dd>
    </div>
  );
}
