'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  EventClickArg,
  EventDropArg,
  DatesSetArg,
  DateSelectArg,
  EventInput,
} from '@fullcalendar/core';
import {
  AdminApiError,
  cancelBooking,
  clearAuth,
  createBlock,
  deleteBlock,
  getAccessToken,
  listBlocks,
  listBookings,
  listEmployees,
  listHolidays,
  listServices,
  markBookingCompleted,
  markBookingNoShow,
  rescheduleBooking,
  type AdminBlock,
  type AdminBooking,
  type AdminEmployee,
  type AdminHoliday,
  type AdminService,
} from '@/lib/api';
import { NavHeader } from '@/components/NavHeader';

const STATUS_COLORS: Record<string, string> = {
  pending: '#fbbf24',
  confirmed: '#3b82f6',
  completed: '#10b981',
  cancelled: '#94a3b8',
  no_show: '#ef4444',
};

const BLOCK_COLOR = '#475569';
const HOLIDAY_COLOR = '#1e293b';

type EventKind = 'booking' | 'block' | 'holiday';

type ExtendedProps = {
  kind: EventKind;
  booking?: AdminBooking;
  block?: AdminBlock;
  holiday?: AdminHoliday;
  service?: AdminService;
  employee?: AdminEmployee;
};

export default function CalendarPage() {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const [services, setServices] = useState<AdminService[]>([]);
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [blocks, setBlocks] = useState<AdminBlock[]>([]);
  const [holidays, setHolidays] = useState<AdminHoliday[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<AdminBlock | null>(null);
  const [newBlockRange, setNewBlockRange] = useState<{ startsAt: string; endsAt: string } | null>(
    null,
  );
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

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

  const reload = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      setError(null);
      try {
        const [b, bl, h] = await Promise.all([
          listBookings({ from, to }),
          listBlocks(from, to),
          listHolidays(from, to),
        ]);
        setBookings(b);
        setBlocks(bl);
        setHolidays(h);
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
    [router],
  );

  useEffect(() => {
    if (range && services.length > 0) reload(range.from, range.to);
  }, [range, services.length, employees.length, reload]);

  // Eventy do FullCalendar — booking + block + holiday, s filtrem
  const events: EventInput[] = useMemo(() => {
    const evts: EventInput[] = [];

    for (const b of bookings) {
      if (employeeFilter !== 'all' && b.employeeId !== employeeFilter) continue;
      const service = services.find((s) => s.id === b.serviceId);
      const employee = employees.find((e) => e.id === b.employeeId);
      const color = STATUS_COLORS[b.status] ?? '#64748b';
      evts.push({
        id: `booking:${b.id}`,
        title: `${service?.name ?? 'Služba'} — ${b.customerName}`,
        start: b.startsAt,
        end: b.endsAt,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { kind: 'booking', booking: b, service, employee } as ExtendedProps,
      });
    }

    for (const bl of blocks) {
      // Filter: pokud je filter aktivni, ukaz block jen pokud patri ke konkretnimu
      // zamestnanci, nebo je to global block (employeeId=null)
      if (employeeFilter !== 'all' && bl.employeeId !== null && bl.employeeId !== employeeFilter) {
        continue;
      }
      evts.push({
        id: `block:${bl.id}`,
        title: bl.title ? `🚫 ${bl.title}` : `🚫 Blokace (${bl.blockType})`,
        start: bl.startsAt,
        end: bl.endsAt,
        backgroundColor: BLOCK_COLOR,
        borderColor: BLOCK_COLOR,
        textColor: '#fff',
        extendedProps: { kind: 'block', block: bl } as ExtendedProps,
      });
    }

    for (const h of holidays) {
      if (h.isOpen) continue; // open holidays nemaji blokovat kalendar vizualne
      evts.push({
        id: `holiday:${h.id}`,
        title: `🎉 ${h.name}`,
        start: h.date,
        allDay: true,
        backgroundColor: HOLIDAY_COLOR,
        borderColor: HOLIDAY_COLOR,
        textColor: '#fff',
        display: 'block',
        extendedProps: { kind: 'holiday', holiday: h } as ExtendedProps,
      });
    }
    return evts;
  }, [bookings, blocks, holidays, services, employees, employeeFilter]);

  function handleDatesSet(arg: DatesSetArg) {
    setRange({ from: arg.startStr, to: arg.endStr });
  }

  function handleEventClick(arg: EventClickArg) {
    const props = arg.event.extendedProps as ExtendedProps;
    if (props.kind === 'booking' && props.booking) {
      setSelectedBooking(props.booking);
    } else if (props.kind === 'block' && props.block) {
      setSelectedBlock(props.block);
    }
  }

  async function handleEventDrop(arg: EventDropArg) {
    const props = arg.event.extendedProps as ExtendedProps;
    // Pres drag-drop premistujeme zatim jen bookings, ne bloky
    if (props.kind !== 'booking') {
      arg.revert();
      return;
    }
    const newStart = arg.event.start;
    if (!newStart || !props.booking) {
      arg.revert();
      return;
    }
    try {
      await rescheduleBooking(props.booking.id, newStart.toISOString());
      if (range) await reload(range.from, range.to);
    } catch (e) {
      arg.revert();
      setError(e instanceof Error ? e.message : 'Přesun selhal');
    }
  }

  function handleSelect(arg: DateSelectArg) {
    // Kliknuti / dragnuti pres prazdny cas -> rovnou nabidnout vytvoreni blokace
    setNewBlockRange({ startsAt: arg.startStr, endsAt: arg.endStr });
    arg.view.calendar.unselect();
  }

  async function handleCreateBlock(input: {
    title: string;
    blockType: string;
    employeeId: string | null;
  }) {
    if (!newBlockRange) return;
    try {
      await createBlock({
        startsAt: newBlockRange.startsAt,
        endsAt: newBlockRange.endsAt,
        blockType: input.blockType,
        title: input.title || undefined,
        employeeId: input.employeeId ?? undefined,
      });
      setNewBlockRange(null);
      if (range) await reload(range.from, range.to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blokace selhala');
    }
  }

  async function handleDeleteBlock() {
    if (!selectedBlock) return;
    if (!window.confirm(`Smazat blokaci "${selectedBlock.title ?? selectedBlock.blockType}"?`)) {
      return;
    }
    try {
      await deleteBlock(selectedBlock.id);
      setSelectedBlock(null);
      if (range) await reload(range.from, range.to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Smazání selhalo');
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

  async function handleMarkNoShow() {
    if (!selectedBooking) return;
    if (!window.confirm('Označit jako „klient nedorazil"? Spustí se pravidla pro no-show.')) return;
    try {
      await markBookingNoShow(selectedBooking.id);
      setSelectedBooking(null);
      if (range) await reload(range.from, range.to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Označení selhalo');
    }
  }

  async function handleMarkCompleted() {
    if (!selectedBooking) return;
    try {
      await markBookingCompleted(selectedBooking.id);
      setSelectedBooking(null);
      if (range) await reload(range.from, range.to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Označení selhalo');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />

      <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-4 text-xs flex-wrap">
        <div className="flex items-center gap-3">
          <LegendDot color={STATUS_COLORS.pending!} label="Čeká" />
          <LegendDot color={STATUS_COLORS.confirmed!} label="Potvrzeno" />
          <LegendDot color={STATUS_COLORS.completed!} label="Dokončeno" />
          <LegendDot color={STATUS_COLORS.cancelled!} label="Zrušeno" />
          <LegendDot color={STATUS_COLORS.no_show!} label="Nepřišel" />
          <LegendDot color={BLOCK_COLOR} label="Blokace" />
          <LegendDot color={HOLIDAY_COLOR} label="Svátek" />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-slate-600">Zaměstnanec:</label>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-xs"
          >
            <option value="all">Všichni</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.displayName ?? `${emp.firstName} ${emp.lastName}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <main className="flex-1 p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 relative">
          {loading && <div className="absolute top-2 right-4 text-xs text-slate-400">načítám…</div>}
          <p className="text-xs text-slate-500 mb-2">
            Tip: tažením prázdné oblasti vytvoříš blokaci. Klikni na blok pro detail / smazání.
          </p>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            buttonText={{ today: 'Dnes', month: 'Měsíc', week: 'Týden', day: 'Den' }}
            locale="cs"
            firstDay={1}
            allDaySlot={true}
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            height="auto"
            events={events}
            editable
            selectable
            selectMirror
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            select={handleSelect}
          />
        </div>
      </main>

      {selectedBooking && (
        <BookingModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onCancel={handleCancel}
          onMarkNoShow={handleMarkNoShow}
          onMarkCompleted={handleMarkCompleted}
          services={services}
          employees={employees}
        />
      )}

      {selectedBlock && (
        <BlockDetailModal
          block={selectedBlock}
          employees={employees}
          onClose={() => setSelectedBlock(null)}
          onDelete={handleDeleteBlock}
        />
      )}

      {newBlockRange && (
        <NewBlockModal
          range={newBlockRange}
          employees={employees}
          defaultEmployeeId={employeeFilter !== 'all' ? employeeFilter : null}
          onClose={() => setNewBlockRange(null)}
          onCreate={handleCreateBlock}
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
  onMarkNoShow,
  onMarkCompleted,
  services,
  employees,
}: {
  booking: AdminBooking;
  onClose: () => void;
  onCancel: () => void;
  onMarkNoShow: () => void;
  onMarkCompleted: () => void;
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

        <div className="flex justify-end gap-2 mt-6 flex-wrap">
          {booking.status !== 'cancelled' &&
            booking.status !== 'completed' &&
            booking.status !== 'no_show' && (
              <>
                <button
                  onClick={onMarkNoShow}
                  className="px-4 py-2 text-orange-700 hover:bg-orange-50 rounded font-medium"
                  title="Klient nedorazil — spustí pravidla pro no-show"
                >
                  Nedorazil/a
                </button>
                <button
                  onClick={onMarkCompleted}
                  className="px-4 py-2 text-emerald-700 hover:bg-emerald-50 rounded font-medium"
                >
                  Dokončeno
                </button>
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded font-medium"
                >
                  Zrušit
                </button>
              </>
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

function BlockDetailModal({
  block,
  employees,
  onClose,
  onDelete,
}: {
  block: AdminBlock;
  employees: AdminEmployee[];
  onClose: () => void;
  onDelete: () => void;
}) {
  const employee = block.employeeId ? employees.find((e) => e.id === block.employeeId) : null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">{block.title ?? 'Blokace'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl">
            ×
          </button>
        </div>
        <dl className="space-y-2 text-sm">
          <Row label="Typ" value={block.blockType} />
          <Row
            label="Začátek"
            value={new Date(block.startsAt).toLocaleString('cs-CZ', {
              timeZone: 'Europe/Prague',
            })}
          />
          <Row
            label="Konec"
            value={new Date(block.endsAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}
          />
          <Row
            label="Zaměstnanec"
            value={
              employee
                ? (employee.displayName ?? `${employee.firstName} ${employee.lastName}`)
                : 'Všichni'
            }
          />
          {block.note && <Row label="Poznámka" value={block.note} />}
        </dl>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onDelete}
            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded font-medium"
          >
            Smazat
          </button>
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

function NewBlockModal({
  range,
  employees,
  defaultEmployeeId,
  onClose,
  onCreate,
}: {
  range: { startsAt: string; endsAt: string };
  employees: AdminEmployee[];
  defaultEmployeeId: string | null;
  onClose: () => void;
  onCreate: (input: { title: string; blockType: string; employeeId: string | null }) => void;
}) {
  const [title, setTitle] = useState('');
  const [blockType, setBlockType] = useState('other');
  const [employeeId, setEmployeeId] = useState<string>(defaultEmployeeId ?? '');

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-2">Nová blokace</h2>
        <p className="text-xs text-slate-500 mb-4">
          {new Date(range.startsAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })} →{' '}
          {new Date(range.endsAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Název</label>
            <input
              type="text"
              placeholder="např. Úklid, Školení..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Typ</label>
            <select
              value={blockType}
              onChange={(e) => setBlockType(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2"
            >
              <option value="cleaning">Úklid</option>
              <option value="training">Školení</option>
              <option value="meeting">Schůzka</option>
              <option value="maintenance">Údržba</option>
              <option value="other">Jiné</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Zaměstnanec</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2"
            >
              <option value="">Všichni (celý salon)</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.displayName ?? `${emp.firstName} ${emp.lastName}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
          >
            Zrušit
          </button>
          <button
            onClick={() => onCreate({ title, blockType, employeeId: employeeId || null })}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
          >
            Vytvořit blokaci
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
