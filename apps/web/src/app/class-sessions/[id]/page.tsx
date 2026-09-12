'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  addToClassWaitlist,
  cancelClassSession,
  clearAuth,
  getAccessToken,
  getClassAttendance,
  getClassSession,
  getClassSpots,
  joinClassSession,
  leaveClassSession,
  listClassParticipants,
  listClassWaitlist,
  listEmployeesFull,
  listResources,
  listServicesFull,
  markClassAttendance,
  removeFromClassWaitlist,
  updateClassSession,
  type AdminClassAttendance,
  type AdminClassParticipant,
  type AdminClassSession,
  type AdminClassSpots,
  type AdminEmployeeFull,
  type AdminResource,
  type AdminServiceFull,
  type AdminWaitlistEntry,
} from '@/lib/api';
import {
  SessionForm,
  localInputToIso,
  sessionToFormValues,
  type SessionFormValues,
} from '../SessionForm';

const PARTICIPANT_STATUS: Record<string, string> = {
  pending: 'Čeká',
  confirmed: 'Přihlášen',
  completed: 'Přišel',
  no_show: 'Nepřišel',
  cancelled: 'Odhlášen',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface JoinFormState {
  target: 'session' | 'waitlist';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNote: string;
  spotLabel: string;
  useMakeupCredit: boolean;
}

const EMPTY_JOIN: Omit<JoinFormState, 'target'> = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerNote: '',
  spotLabel: '',
  useMakeupCredit: false,
};

export default function ClassSessionDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [session, setSession] = useState<AdminClassSession | null>(null);
  const [participants, setParticipants] = useState<AdminClassParticipant[]>([]);
  const [waitlist, setWaitlist] = useState<AdminWaitlistEntry[]>([]);
  const [attendance, setAttendance] = useState<AdminClassAttendance | null>(null);
  const [spots, setSpots] = useState<AdminClassSpots | null>(null);
  const [services, setServices] = useState<AdminServiceFull[]>([]);
  const [employees, setEmployees] = useState<AdminEmployeeFull[]>([]);
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SessionFormValues | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [joinForm, setJoinForm] = useState<JoinFormState | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, w, a, svc, emp, res] = await Promise.all([
        getClassSession(params.id),
        listClassParticipants(params.id),
        listClassWaitlist(params.id),
        getClassAttendance(params.id),
        listServicesFull(),
        listEmployeesFull(),
        listResources(),
      ]);
      setSession(s);
      setParticipants(p);
      setWaitlist(w);
      setAttendance(a);
      setServices(svc);
      setEmployees(emp);
      setResources(res);
      setSpots(s.spotCount > 0 ? await getClassSpots(params.id) : null);
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
  }, [params.id, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleEditSave() {
    if (!editForm || !session) return;
    setEditError(null);
    try {
      await updateClassSession(session.id, {
        startsAt: localInputToIso(editForm.startsAtLocal),
        employeeId: editForm.employeeId || null,
        resourceId: editForm.resourceId || null,
        capacity: editForm.capacity,
        minAge: editForm.minAge === '' ? null : Number(editForm.minAge),
        maxAge: editForm.maxAge === '' ? null : Number(editForm.maxAge),
        prerequisiteServiceId: editForm.prerequisiteServiceId || null,
      });
      setEditForm(null);
      await reload();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleJoinSave() {
    if (!joinForm || !session) return;
    setJoinError(null);
    if (!joinForm.customerName.trim() || !joinForm.customerEmail.trim()) {
      setJoinError('Jméno i e-mail jsou povinné.');
      return;
    }
    const payload = {
      customerName: joinForm.customerName.trim(),
      customerEmail: joinForm.customerEmail.trim(),
      customerPhone: joinForm.customerPhone.trim() || null,
      customerNote: joinForm.customerNote.trim() || null,
      spotLabel: joinForm.spotLabel || null,
      useMakeupCredit: joinForm.useMakeupCredit,
    };
    try {
      if (joinForm.target === 'waitlist') {
        await addToClassWaitlist(session.id, payload);
      } else {
        await joinClassSession(session.id, payload);
      }
      setJoinForm(null);
      await reload();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  if (loading && !session) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 max-w-5xl mx-auto w-full text-slate-500">Načítám…</main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
            {error ?? 'Lekce nenalezena.'}
          </div>
          <Link href="/class-sessions" className="text-brand-600 hover:underline text-sm">
            ← Zpět na lekce
          </Link>
        </main>
      </div>
    );
  }

  const service = services.find((s) => s.id === session.serviceId);
  const employee = employees.find((e) => e.id === session.employeeId);
  const resource = resources.find((r) => r.id === session.resourceId);
  const isFull = session.bookedCount >= session.capacity;
  const editable = session.status === 'open';

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <Link href="/class-sessions" className="text-brand-600 hover:underline text-sm">
          ← Zpět na lekce
        </Link>

        <div className="flex items-start justify-between mt-2 mb-4">
          <div>
            <h2 className="text-2xl font-bold">{service?.name ?? 'Lekce'}</h2>
            <p className="text-sm text-slate-500">
              {formatDateTime(session.startsAt)} – {formatDateTime(session.endsAt)}
              {employee &&
                ` · ${employee.displayName ?? `${employee.firstName} ${employee.lastName}`}`}
              {resource && ` · ${resource.name}`}
            </p>
          </div>
          <div className="flex gap-2">
            {editable && (
              <button
                onClick={() => {
                  setEditError(null);
                  setEditForm(sessionToFormValues(session));
                }}
                className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
              >
                Upravit
              </button>
            )}
            {editable && (
              <button
                onClick={() => {
                  if (
                    !confirm(
                      `Zrušit lekci? Všech ${session.bookedCount} přihlášených se odhlásí, dostanou náhradu a vrátí se jim permanentka.`,
                    )
                  )
                    return;
                  run(() => cancelClassSession(session.id));
                }}
                className="px-4 py-2 border border-red-300 text-red-700 rounded font-medium hover:bg-red-50"
              >
                Zrušit lekci
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {session.status === 'cancelled' && (
          <div className="bg-slate-100 border border-slate-200 text-slate-700 text-sm p-3 rounded mb-4">
            Lekce je zrušená — upravovat ji už nelze.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Obsazenost</div>
            <div className={`text-xl font-bold ${isFull ? 'text-amber-700' : ''}`}>
              {session.bookedCount}/{session.capacity}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Přišlo</div>
            <div className="text-xl font-bold text-green-700">{attendance?.present ?? 0}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Nepřišlo</div>
            <div className="text-xl font-bold text-red-700">{attendance?.noShow ?? 0}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Pořadník</div>
            <div className="text-xl font-bold">{waitlist.length}</div>
          </div>
        </div>

        {(session.minAge != null || session.maxAge != null || session.prerequisiteServiceId) && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 text-sm">
            <span className="font-semibold">Podmínky účasti: </span>
            {session.minAge != null && <>věk od {session.minAge} </>}
            {session.maxAge != null && <>do {session.maxAge} </>}
            {session.prerequisiteServiceId && (
              <>
                · vyžaduje dokončenou službu{' '}
                {services.find((s) => s.id === session.prerequisiteServiceId)?.name ?? '—'}
              </>
            )}
          </div>
        )}

        {editForm && (
          <SessionForm
            mode="edit"
            values={editForm}
            services={services}
            employees={employees}
            resources={resources}
            error={editError}
            onChange={setEditForm}
            onSubmit={handleEditSave}
            onCancel={() => setEditForm(null)}
          />
        )}

        {joinForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-lg font-bold mb-4">
                {joinForm.target === 'waitlist' ? 'Přidat do pořadníku' : 'Přihlásit klienta'}
              </h3>
              {joinError && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
                  {joinError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Jméno a příjmení *</label>
                  <input
                    type="text"
                    value={joinForm.customerName}
                    onChange={(e) => setJoinForm({ ...joinForm, customerName: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">E-mail *</label>
                  <input
                    type="email"
                    value={joinForm.customerEmail}
                    onChange={(e) => setJoinForm({ ...joinForm, customerEmail: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={joinForm.customerPhone}
                    onChange={(e) => setJoinForm({ ...joinForm, customerPhone: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Poznámka</label>
                  <textarea
                    rows={2}
                    value={joinForm.customerNote}
                    onChange={(e) => setJoinForm({ ...joinForm, customerNote: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                {joinForm.target === 'session' && spots && spots.spotCount > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Místo v sále</label>
                    <select
                      value={joinForm.spotLabel}
                      onChange={(e) => setJoinForm({ ...joinForm, spotLabel: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-2"
                    >
                      <option value="">— bez výběru —</option>
                      {spots.free.map((s) => (
                        <option key={s} value={s}>
                          Místo {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {joinForm.target === 'session' && (
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={joinForm.useMakeupCredit}
                      onChange={(e) =>
                        setJoinForm({ ...joinForm, useMakeupCredit: e.target.checked })
                      }
                    />
                    Použít náhradu (lekce zdarma)
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setJoinForm(null)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleJoinSave}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  {joinForm.target === 'waitlist' ? 'Přidat' : 'Přihlásit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Přihlášení */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold">Přihlášení</h3>
          {editable && (
            <button
              onClick={() => {
                setJoinError(null);
                setJoinForm({ target: 'session', ...EMPTY_JOIN });
              }}
              className="text-sm bg-brand-600 hover:bg-brand-700 text-white font-medium px-3 py-1.5 rounded"
            >
              + Přihlásit klienta
            </button>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Klient</th>
                <th className="text-left px-4 py-3 font-semibold">E-mail</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="w-64"></th>
              </tr>
            </thead>
            <tbody>
              {participants.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-500">
                    Nikdo není přihlášen.
                  </td>
                </tr>
              )}
              {participants.map((p) => (
                <tr key={p.bookingId} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{p.customerName}</td>
                  <td className="px-4 py-3 text-slate-600">{p.customerEmail}</td>
                  <td className="text-center px-4 py-3 text-xs">
                    {PARTICIPANT_STATUS[p.status] ?? p.status}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => run(() => markClassAttendance(session.id, p.bookingId, true))}
                      className="text-green-700 hover:underline text-sm mr-3"
                    >
                      Přišel
                    </button>
                    <button
                      onClick={() => run(() => markClassAttendance(session.id, p.bookingId, false))}
                      className="text-amber-700 hover:underline text-sm mr-3"
                    >
                      Nepřišel
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Odhlásit ${p.customerName} z lekce?`)) return;
                        run(() => leaveClassSession(session.id, p.bookingId));
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Odhlásit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pořadník */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold">Pořadník</h3>
          {editable && isFull && (
            <button
              onClick={() => {
                setJoinError(null);
                setJoinForm({ target: 'waitlist', ...EMPTY_JOIN });
              }}
              className="text-sm border border-slate-300 font-medium px-3 py-1.5 rounded hover:bg-slate-50"
            >
              + Přidat do pořadníku
            </button>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold w-16">Pořadí</th>
                <th className="text-left px-4 py-3 font-semibold">Klient</th>
                <th className="text-left px-4 py-3 font-semibold">E-mail</th>
                <th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {waitlist.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-500">
                    Pořadník je prázdný.
                    {!isFull && ' Zařadit do něj lze až plnou lekci.'}
                  </td>
                </tr>
              )}
              {waitlist.map((w) => (
                <tr key={w.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{w.position}.</td>
                  <td className="px-4 py-3">{w.customerName}</td>
                  <td className="px-4 py-3 text-slate-600">{w.customerEmail}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (!confirm(`Odebrat ${w.customerName} z pořadníku?`)) return;
                        run(() => removeFromClassWaitlist(session.id, w.id));
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Odebrat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mb-8">
          Když se někdo odhlásí, první čekající se povýší na rezervaci automaticky.
        </p>

        {/* Místa v sále */}
        {spots && spots.spotCount > 0 && (
          <>
            <h3 className="text-lg font-bold mb-2">Místa v sále</h3>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-2">
              {Array.from({ length: spots.spotCount }, (_, i) => String(i + 1)).map((label) => {
                const taken = spots.taken.includes(label);
                return (
                  <span
                    key={label}
                    className={`w-10 h-10 rounded flex items-center justify-center text-sm font-medium ${
                      taken
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-slate-50 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
