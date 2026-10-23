'use client';

// Outlook (Microsoft 365) a CalDAV (Apple iCloud, Nextcloud…) kalendáře
// zaměstnanců. Rezervace se do nich zapisují a jejich události blokují
// termíny — stejně jako u Google Calendar výše.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectCaldav,
  listCalendarConnections,
  revokeCalendarConnection,
  startOutlookConnect,
  syncCalendarConnection,
  updateCalendarConnection,
  type AdminCalendarConnection,
  type AdminEmployee,
  type CalendarProvider,
} from '@/lib/api';

const PROVIDER_LABEL: Record<CalendarProvider, string> = {
  outlook: 'Outlook / Microsoft 365',
  caldav: 'CalDAV (Apple, Nextcloud…)',
};

const APPLE_CALDAV = 'https://caldav.icloud.com';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OtherCalendars({
  employees,
  onMessage,
}: {
  employees: AdminEmployee[];
  onMessage: (m: { error?: string; success?: string }) => void;
}) {
  const [connections, setConnections] = useState<AdminCalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{
    employeeId: string;
    serverUrl: string;
    username: string;
    password: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Rodič posílá novou funkci při každém vykreslení — přes ref, ať se
  // načítání nespouští dokola.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const reload = useCallback(async () => {
    try {
      setConnections(await listCalendarConnections());
    } catch (e) {
      onMessageRef.current({ error: e instanceof Error ? e.message : 'Chyba' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function act(fn: () => Promise<void>) {
    try {
      await fn();
      await reload();
    } catch (e) {
      onMessage({ error: e instanceof Error ? e.message : 'Chyba' });
    }
  }

  async function outlook(employeeId: string) {
    try {
      window.location.href = (await startOutlookConnect(employeeId)).authUrl;
    } catch (e) {
      onMessage({ error: e instanceof Error ? e.message : 'Chyba' });
    }
  }

  async function submitCaldav(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const r = await connectCaldav(form);
      onMessage({ success: `Kalendář „${r.calendarName}" připojen.` });
      setForm(null);
      await reload();
    } catch (err) {
      onMessage({ error: err instanceof Error ? err.message : 'Chyba' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-6 bg-white rounded-xl border border-slate-200 overflow-hidden"
      data-testid="other-calendars"
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="font-semibold">Outlook a další kalendáře</h3>
        <p className="text-xs text-slate-500 mt-1">
          Outlook (Microsoft 365) a kalendáře CalDAV — Apple iCloud, Nextcloud a další. Rezervace se
          zapisují do kalendáře zaměstnance a jeho události (schůzky, dovolená) blokují termíny.
          Změny se stahují automaticky.
        </p>
      </div>

      {loading ? (
        <p className="p-4 text-sm text-slate-500">Načítám…</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-4 py-2">Zaměstnanec</th>
              <th className="px-4 py-2">Připojené kalendáře</th>
              <th className="px-4 py-2 text-right">Připojit</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const name = emp.displayName ?? `${emp.firstName} ${emp.lastName}`.trim();
              const conns = connections.filter((c) => c.employeeId === emp.id);
              return (
                <tr key={emp.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-medium">{name}</td>
                  <td className="px-4 py-3">
                    {conns.length === 0 && <span className="text-xs text-slate-400">—</span>}
                    {conns.map((c) => (
                      <div key={c.id} className="mb-2 last:mb-0">
                        <div className="font-medium">
                          {PROVIDER_LABEL[c.provider]}
                          <span className="text-slate-500 font-normal">
                            {' '}
                            · {c.accountEmail ?? '—'}
                            {c.calendarName ? ` · ${c.calendarName}` : ''}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {c.isActive ? 'Aktivní' : 'Pozastaveno'} · poslední stažení{' '}
                          {formatDate(c.lastInboundSyncAt)}
                        </div>
                        {c.lastSyncError && (
                          <div
                            className="text-xs text-red-600 max-w-md truncate"
                            title={c.lastSyncError}
                          >
                            {c.consecutiveErrors} chyb v řadě: {c.lastSyncError}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs mt-1">
                          <label className="inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={c.outboundEnabled}
                              onChange={() =>
                                act(() =>
                                  updateCalendarConnection(c.id, {
                                    outboundEnabled: !c.outboundEnabled,
                                  }),
                                )
                              }
                            />
                            Zapisovat rezervace
                          </label>
                          <label className="inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={c.inboundSyncEnabled}
                              onChange={() =>
                                act(() =>
                                  updateCalendarConnection(c.id, {
                                    inboundSyncEnabled: !c.inboundSyncEnabled,
                                  }),
                                )
                              }
                            />
                            Události blokují termíny
                          </label>
                          {!c.isActive && (
                            <button
                              className="text-brand-600 hover:underline"
                              onClick={() =>
                                act(() => updateCalendarConnection(c.id, { isActive: true }))
                              }
                            >
                              Znovu zapnout
                            </button>
                          )}
                          {c.inboundSyncEnabled && c.isActive && (
                            <button
                              className="text-brand-600 hover:underline"
                              onClick={() =>
                                act(async () => {
                                  const r = await syncCalendarConnection(c.id);
                                  onMessage({
                                    success: `Staženo: nových ${r.created}, změněných ${r.updated}, smazaných ${r.deleted}.`,
                                  });
                                })
                              }
                            >
                              Stáhnout teď
                            </button>
                          )}
                          <button
                            className="text-red-600 hover:underline"
                            onClick={() => {
                              if (confirm(`Odpojit ${PROVIDER_LABEL[c.provider]} pro ${name}?`)) {
                                act(() => revokeCalendarConnection(c.id));
                              }
                            }}
                          >
                            Odpojit
                          </button>
                        </div>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => outlook(emp.id)}
                      className="text-brand-600 hover:underline text-sm block ml-auto"
                    >
                      Outlook
                    </button>
                    <button
                      onClick={() =>
                        setForm({
                          employeeId: emp.id,
                          serverUrl: APPLE_CALDAV,
                          username: '',
                          password: '',
                        })
                      }
                      className="text-brand-600 hover:underline text-sm block ml-auto mt-1"
                    >
                      Apple / CalDAV
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {form && (
        <form
          onSubmit={submitCaldav}
          className="border-t border-slate-100 p-4 space-y-3 bg-slate-50"
        >
          <h4 className="font-semibold text-sm">
            Připojit kalendář CalDAV —{' '}
            {(() => {
              const e = employees.find((x) => x.id === form.employeeId);
              return e ? (e.displayName ?? `${e.firstName} ${e.lastName}`) : '';
            })()}
          </h4>
          <p className="text-xs text-slate-500">
            Apple iCloud: adresa <code>{APPLE_CALDAV}</code>, jméno = Apple ID a heslo{' '}
            <strong>pro aplikace</strong> (appleid.apple.com → Přihlašování a zabezpečení).
            Nextcloud a jiné: adresa CalDAV serveru z nastavení kalendáře.
          </p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input
              required
              type="url"
              value={form.serverUrl}
              onChange={(e) => setForm({ ...form, serverUrl: e.target.value })}
              placeholder="Adresa serveru"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Uživatel / Apple ID"
              autoComplete="off"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Heslo pro aplikace"
              autoComplete="new-password"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Připojuji…' : 'Připojit'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="text-sm text-slate-600 hover:underline"
            >
              Zrušit
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
