'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  listEmployees,
  listGoogleConnections,
  revokeGoogleConnection,
  startGoogleConnect,
  type AdminEmployee,
  type AdminGoogleConnection,
} from '@/lib/api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [connections, setConnections] = useState<AdminGoogleConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  // Detekce ?google_success=1 nebo ?google_error po OAuth callback
  useEffect(() => {
    const successFlag = searchParams?.get('google_success');
    const errorFlag = searchParams?.get('google_error');
    const email = searchParams?.get('email');
    if (successFlag) {
      setSuccess(`Google Calendar úspěšně propojen${email ? ` (${email})` : ''}.`);
      setTimeout(() => setSuccess(null), 5000);
    } else if (errorFlag) {
      setError(`Propojení selhalo: ${decodeURIComponent(errorFlag)}`);
    }
  }, [searchParams]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [emp, conn] = await Promise.all([listEmployees(), listGoogleConnections()]);
      setEmployees(emp);
      setConnections(conn);
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
  }, [router]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleConnect(employeeId: string) {
    setError(null);
    try {
      const result = await startGoogleConnect(employeeId);
      // Redirect na Google OAuth
      window.location.href = result.authUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleRevoke(employeeId: string, displayName: string) {
    if (!confirm(`Odpojit Google Calendar pro ${displayName}? Existující rezervace zůstanou.`)) {
      return;
    }
    try {
      await revokeGoogleConnection(employeeId);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  // Map employee -> nejnovejsi aktivni connection (nebo posledni revokovana)
  const byEmployee = new Map<string, AdminGoogleConnection>();
  for (const conn of connections) {
    const existing = byEmployee.get(conn.employeeId);
    if (!existing) {
      byEmployee.set(conn.employeeId, conn);
      continue;
    }
    // Predejdi aktivni pred revokovanou
    if (conn.isActive && !existing.isActive) {
      byEmployee.set(conn.employeeId, conn);
    } else if (
      conn.isActive === existing.isActive &&
      new Date(conn.createdAt) > new Date(existing.createdAt)
    ) {
      byEmployee.set(conn.employeeId, conn);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <h2 className="text-2xl font-bold mb-2">Integrace</h2>
        <p className="text-sm text-slate-500 mb-6">
          Externí služby propojené s Reserved. Aktuálně Google Calendar 2-way sync rezervací.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 rounded mb-4">
            {success}
          </div>
        )}

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold">Google Calendar</h3>
            <p className="text-xs text-slate-500 mt-1">
              Po propojení se rezervace zaměstnance automaticky synchronizují do jeho Google
              Kalendáře (outbound). Inbound sync (blokace dovolených/událostí z Google) bude přidán
              v další iteraci.
            </p>
          </div>

          {loading ? (
            <p className="p-4 text-sm text-slate-500">Načítám...</p>
          ) : employees.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              Žádní zaměstnanci. Přidej je v sekci{' '}
              <button onClick={() => router.push('/branches')} className="text-brand-600 underline">
                Pobočky
              </button>
              .
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2">Zaměstnanec</th>
                  <th className="px-4 py-2">Google účet</th>
                  <th className="px-4 py-2">Stav</th>
                  <th className="px-4 py-2">Poslední sync</th>
                  <th className="px-4 py-2 text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const conn = byEmployee.get(emp.id);
                  const displayName = emp.displayName ?? `${emp.firstName} ${emp.lastName}`.trim();
                  const isConnected = conn && conn.isActive && !conn.revokedAt;
                  const hasError = conn?.lastSyncError;
                  const errorCount = conn ? Number(conn.consecutiveErrors) : 0;

                  return (
                    <tr key={emp.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">{displayName}</td>
                      <td className="px-4 py-3 text-slate-600">{conn?.googleEmail ?? '—'}</td>
                      <td className="px-4 py-3">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs rounded-full">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            Propojeno
                          </span>
                        ) : conn?.revokedAt ? (
                          <span className="text-xs text-slate-500">Odpojeno</span>
                        ) : (
                          <span className="text-xs text-slate-500">Nepropojeno</span>
                        )}
                        {errorCount > 0 && (
                          <div className="text-xs text-red-600 mt-1">
                            {errorCount} chyb v řadě
                            {errorCount >= 5 && ' (pozastaveno)'}
                          </div>
                        )}
                        {hasError && (
                          <div
                            className="text-xs text-red-600 mt-1 max-w-xs truncate"
                            title={hasError}
                          >
                            {hasError}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDate(conn?.lastSyncedAt ?? null)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isConnected ? (
                          <button
                            onClick={() => handleRevoke(emp.id, displayName)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Odpojit
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConnect(emp.id)}
                            className="text-brand-600 hover:underline text-sm"
                          >
                            Propojit Google
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <h3 className="font-semibold text-amber-900 mb-1">Co je potřeba pro funkčnost</h3>
          <p className="text-amber-800 text-xs leading-relaxed">
            Aby Google Calendar fungoval, musí být v API serveru nastavené env vars
            <code className="px-1">GOOGLE_CLIENT_ID</code>,{' '}
            <code className="px-1">GOOGLE_CLIENT_SECRET</code> a{' '}
            <code className="px-1">GOOGLE_REDIRECT_URI</code>. Kontaktuj support pokud nefunguje.
          </p>
        </section>
      </main>
    </div>
  );
}
