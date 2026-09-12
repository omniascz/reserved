'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createClassSession,
  getAccessToken,
  listClassSessions,
  listEmployeesFull,
  listResources,
  listServicesFull,
  type AdminClassSession,
  type AdminEmployeeFull,
  type AdminResource,
  type AdminServiceFull,
  type ClassSessionListStatus,
} from '@/lib/api';
import {
  SessionForm,
  emptyFormValues,
  localInputToIso,
  isoToLocalInput,
  type SessionFormValues,
} from './SessionForm';

const STATUS_OPTIONS: Array<{ value: ClassSessionListStatus; label: string }> = [
  { value: 'open', label: 'Otevřené s volným místem' },
  { value: 'full', label: 'Plné (pořadník)' },
  { value: 'cancelled', label: 'Zrušené' },
  { value: 'completed', label: 'Dokončené' },
  { value: 'all', label: 'Všechny' },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ClassSessionsPage({
  searchParams,
}: {
  // Klientská stránka dostane parametry z URL propem — záměrně NE přes
  // useSearchParams, který bez <Suspense> rozbíjí prerender.
  searchParams?: { recurrenceId?: string; status?: string };
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AdminClassSession[]>([]);
  const [services, setServices] = useState<AdminServiceFull[]>([]);
  const [employees, setEmployees] = useState<AdminEmployeeFull[]>([]);
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<SessionFormValues | null>(null);

  const today = new Date();
  const inTwoWeeks = new Date(today.getTime() + 14 * 86400_000);
  const recurrenceId = searchParams?.recurrenceId ?? '';
  const initialStatus = STATUS_OPTIONS.some((o) => o.value === searchParams?.status)
    ? (searchParams?.status as ClassSessionListStatus)
    : 'open';
  const [status, setStatus] = useState<ClassSessionListStatus>(initialStatus);
  const [serviceId, setServiceId] = useState('');
  // U filtru na rozvrh nechceme časové okno — lekce jsou vygenerované na měsíce dopředu.
  const [from, setFrom] = useState(recurrenceId ? '' : toDateInput(today));
  const [to, setTo] = useState(recurrenceId ? '' : toDateInput(inTwoWeeks));

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [sess, svc, emp, res] = await Promise.all([
        listClassSessions({
          status,
          serviceId: serviceId || undefined,
          recurrenceId: recurrenceId || undefined,
          from: from ? `${from}T00:00:00.000Z` : undefined,
          to: to ? `${to}T23:59:59.000Z` : undefined,
        }),
        listServicesFull(),
        listEmployeesFull(),
        listResources(),
      ]);
      setSessions(sess);
      setServices(svc);
      setEmployees(emp);
      setResources(res);
      setError(null);
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
  }, [router, status, serviceId, recurrenceId, from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  function serviceName(id: string): string {
    return services.find((s) => s.id === id)?.name ?? '—';
  }

  function employeeName(id: string | null): string {
    if (!id) return '—';
    const e = employees.find((x) => x.id === id);
    return e ? (e.displayName ?? `${e.firstName} ${e.lastName}`) : '—';
  }

  function resourceName(id: string | null): string {
    if (!id) return '—';
    return resources.find((r) => r.id === id)?.name ?? '—';
  }

  function startNew() {
    const start = new Date(Date.now() + 86400_000);
    start.setMinutes(0, 0, 0);
    setFormError(null);
    setForm(emptyFormValues(isoToLocalInput(start.toISOString())));
  }

  async function handleCreate() {
    if (!form) return;
    setFormError(null);
    if (!form.serviceId) {
      setFormError('Vyber službu.');
      return;
    }
    if (!form.startsAtLocal) {
      setFormError('Zadej začátek lekce.');
      return;
    }
    try {
      await createClassSession({
        serviceId: form.serviceId,
        employeeId: form.employeeId || null,
        resourceId: form.resourceId || null,
        startsAt: localInputToIso(form.startsAtLocal),
        capacity: form.capacity,
        spotCount: form.spotCount,
        minAge: form.minAge === '' ? null : Number(form.minAge),
        maxAge: form.maxAge === '' ? null : Number(form.maxAge),
        prerequisiteServiceId: form.prerequisiteServiceId || null,
      });
      setForm(null);
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Lekce</h2>
            <p className="text-sm text-slate-500">
              Skupinové a EMS lekce — obsazenost, přihlášení klienti, pořadník.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/class-sessions/recurrences"
              className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
            >
              Opakovaný rozvrh
            </Link>
            <button
              onClick={startNew}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
            >
              + Nová lekce
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {recurrenceId && (
          <div className="bg-brand-50 border border-brand-200 text-brand-900 text-sm p-3 rounded mb-4 flex items-center justify-between">
            <span>Zobrazuji jen lekce z jednoho opakovaného rozvrhu.</span>
            <Link href="/class-sessions" className="underline font-medium">
              Zrušit filtr
            </Link>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Stav</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ClassSessionListStatus)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Služba</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Všechny</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Od</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Do</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {form && (
          <SessionForm
            mode="create"
            values={form}
            services={services}
            employees={employees}
            resources={resources}
            error={formError}
            onChange={setForm}
            onSubmit={handleCreate}
            onCancel={() => setForm(null)}
          />
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Termín</th>
                <th className="text-left px-4 py-3 font-semibold">Služba</th>
                <th className="text-left px-4 py-3 font-semibold">Trenér</th>
                <th className="text-left px-4 py-3 font-semibold">Přístroj</th>
                <th className="text-left px-4 py-3 font-semibold">Obsazenost</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Načítám…
                  </td>
                </tr>
              )}
              {!loading && sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Žádné lekce v tomto filtru. Vypiš první lekci, nebo si vytvoř opakovaný rozvrh.
                  </td>
                </tr>
              )}
              {sessions.map((s) => {
                const pct = s.capacity > 0 ? Math.round((s.bookedCount / s.capacity) * 100) : 0;
                const isFull = s.bookedCount >= s.capacity;
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">{formatDateTime(s.startsAt)}</td>
                    <td className="px-4 py-3">{serviceName(s.serviceId)}</td>
                    <td className="px-4 py-3 text-slate-600">{employeeName(s.employeeId)}</td>
                    <td className="px-4 py-3 text-slate-600">{resourceName(s.resourceId)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-slate-100 rounded overflow-hidden">
                          <div
                            className={`h-full ${isFull ? 'bg-amber-500' : 'bg-brand-600'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className={isFull ? 'text-amber-700 font-medium' : ''}>
                          {s.bookedCount}/{s.capacity}
                        </span>
                      </div>
                    </td>
                    <td className="text-center px-4 py-3 text-xs">
                      {s.status === 'open' && !isFull && (
                        <span className="text-green-700">otevřená</span>
                      )}
                      {s.status === 'open' && isFull && (
                        <span className="text-amber-700">plná</span>
                      )}
                      {s.status === 'cancelled' && <span className="text-slate-400">zrušená</span>}
                      {s.status === 'completed' && (
                        <span className="text-slate-500">dokončená</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/class-sessions/${s.id}`}
                        className="text-brand-600 hover:underline text-sm"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
