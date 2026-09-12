'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  cancelClassRecurrence,
  clearAuth,
  createClassRecurrence,
  getAccessToken,
  listClassRecurrences,
  listEmployeesFull,
  listResources,
  listServicesFull,
  type AdminClassRecurrence,
  type AdminEmployeeFull,
  type AdminResource,
  type AdminServiceFull,
} from '@/lib/api';

const DAYS = [
  { iso: 1, label: 'Po' },
  { iso: 2, label: 'Út' },
  { iso: 3, label: 'St' },
  { iso: 4, label: 'Čt' },
  { iso: 5, label: 'Pá' },
  { iso: 6, label: 'So' },
  { iso: 7, label: 'Ne' },
];

interface FormState {
  serviceId: string;
  employeeId: string;
  resourceId: string;
  capacity: number;
  daysOfWeek: number[];
  time: string;
  startDate: string;
  endDate: string;
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  const today = new Date();
  const inThreeMonths = new Date(today.getTime() + 90 * 86400_000);
  return {
    serviceId: '',
    employeeId: '',
    resourceId: '',
    capacity: 12,
    daysOfWeek: [1, 3],
    time: '18:00',
    startDate: toDateInput(today),
    endDate: toDateInput(inThreeMonths),
  };
}

export default function RecurrencesPage() {
  const router = useRouter();
  const [recurrences, setRecurrences] = useState<AdminClassRecurrence[]>([]);
  const [services, setServices] = useState<AdminServiceFull[]>([]);
  const [employees, setEmployees] = useState<AdminEmployeeFull[]>([]);
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    requested: number;
    skipped: Array<{ startsAt: string; reason: string }>;
  } | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [recs, svc, emp, res] = await Promise.all([
        listClassRecurrences(statusFilter),
        listServicesFull(),
        listEmployeesFull(),
        listResources(),
      ]);
      setRecurrences(recs);
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
  }, [router, statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  function serviceName(id: string): string {
    return services.find((s) => s.id === id)?.name ?? '—';
  }

  async function handleCreate() {
    if (!form) return;
    setFormError(null);
    if (!form.serviceId) {
      setFormError('Vyber službu.');
      return;
    }
    if (form.daysOfWeek.length === 0) {
      setFormError('Vyber aspoň jeden den v týdnu.');
      return;
    }
    try {
      const res = await createClassRecurrence({
        serviceId: form.serviceId,
        employeeId: form.employeeId || null,
        resourceId: form.resourceId || null,
        capacity: form.capacity,
        daysOfWeek: [...form.daysOfWeek].sort((a, b) => a - b),
        time: form.time,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      setResult({ created: res.created, requested: res.requested, skipped: res.skipped });
      setForm(null);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleCancel(r: AdminClassRecurrence) {
    if (
      !confirm(
        'Zrušit rozvrh? Zruší se i všechny jeho budoucí lekce — přihlášení dostanou náhradu.',
      )
    )
      return;
    setError(null);
    try {
      await cancelClassRecurrence(r.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  const machines = resources.filter((r) => r.type !== 'table' && r.isActive);

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <Link href="/class-sessions" className="text-brand-600 hover:underline text-sm">
          ← Zpět na lekce
        </Link>

        <div className="flex items-center justify-between mt-2 mb-4">
          <div>
            <h2 className="text-2xl font-bold">Opakovaný rozvrh</h2>
            <p className="text-sm text-slate-500">
              Pravidlo typu „každé Po a St v 18:00 na tři měsíce" vygeneruje lekce dopředu.
            </p>
          </div>
          <button
            onClick={() => {
              setFormError(null);
              setResult(null);
              setForm(emptyForm());
            }}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nový rozvrh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 text-green-900 text-sm p-3 rounded mb-4">
            Vytvořeno {result.created} z {result.requested} termínů.
            {result.skipped.length > 0 && (
              <ul className="mt-2 list-disc list-inside text-green-800">
                {result.skipped.slice(0, 10).map((s) => (
                  <li key={s.startsAt}>
                    {new Date(s.startsAt).toLocaleString('cs-CZ')} — přeskočeno ({s.reason})
                  </li>
                ))}
                {result.skipped.length > 10 && <li>… a další {result.skipped.length - 10}</li>}
              </ul>
            )}
          </div>
        )}

        {form && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Nový opakovaný rozvrh</h3>
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Služba *</label>
                  <select
                    value={form.serviceId}
                    onChange={(e) => {
                      const svc = services.find((s) => s.id === e.target.value);
                      setForm({
                        ...form,
                        serviceId: e.target.value,
                        capacity: svc ? svc.capacity : form.capacity,
                      });
                    }}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="">— vyber službu —</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.durationMinutes} min · kapacita {s.capacity}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Dny v týdnu *</label>
                  <div className="flex gap-2">
                    {DAYS.map((d) => {
                      const on = form.daysOfWeek.includes(d.iso);
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              daysOfWeek: on
                                ? form.daysOfWeek.filter((x) => x !== d.iso)
                                : [...form.daysOfWeek, d.iso],
                            })
                          }
                          className={`w-11 h-10 rounded font-medium text-sm border ${
                            on
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Čas začátku *</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Kapacita *</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 1 })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Od *</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Do *</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Trenér</label>
                  <select
                    value={form.employeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="">— bez trenéra —</option>
                    {employees
                      .filter((e) => e.isActive)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.displayName ?? `${e.firstName} ${e.lastName}`}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Přístroj (EMS)</label>
                  <select
                    value={form.resourceId}
                    onChange={(e) => setForm({ ...form, resourceId: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="">— bez přístroje —</option>
                    {machines.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Termíny, kde už trenér nebo přístroj nestíhá, se přeskočí a vypíšeme je.
              </p>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setForm(null)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  Vygenerovat lekce
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-medium text-slate-500 mr-2">Stav</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'cancelled')}
            className="border border-slate-300 rounded px-3 py-2 text-sm"
          >
            <option value="all">Všechny</option>
            <option value="active">Aktivní</option>
            <option value="cancelled">Zrušené</option>
          </select>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Služba</th>
                <th className="text-left px-4 py-3 font-semibold">Dny</th>
                <th className="text-left px-4 py-3 font-semibold">Čas</th>
                <th className="text-left px-4 py-3 font-semibold">Období</th>
                <th className="text-left px-4 py-3 font-semibold">Lekce</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="w-32"></th>
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
              {!loading && recurrences.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Žádný rozvrh. Vytvoř první a lekce se vygenerují samy.
                  </td>
                </tr>
              )}
              {recurrences.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{serviceName(r.serviceId)}</td>
                  <td className="px-4 py-3">
                    {r.daysOfWeek.map((d) => DAYS.find((x) => x.iso === d)?.label).join(', ')}
                  </td>
                  <td className="px-4 py-3">{r.time}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.startDate} → {r.endDate}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/class-sessions?recurrenceId=${r.id}&status=all`}
                      className="text-brand-600 hover:underline"
                    >
                      {r.sessionCount} lekcí
                    </Link>
                    <div className="text-xs text-slate-500">
                      {r.openCount} otevřených
                      {r.cancelledCount > 0 && ` · ${r.cancelledCount} zrušených`}
                    </div>
                  </td>
                  <td className="text-center px-4 py-3 text-xs">
                    {r.status === 'active' ? (
                      <span className="text-green-700">aktivní</span>
                    ) : (
                      <span className="text-slate-400">zrušený</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'active' && (
                      <button
                        onClick={() => handleCancel(r)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Zrušit rozvrh
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
