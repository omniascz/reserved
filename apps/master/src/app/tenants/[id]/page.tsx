'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  changeTenantPlan,
  extendTrial,
  getAccessToken,
  getAdminBaseUrl,
  getTenantActivity,
  getTenantAudit,
  getTenantDetail,
  getTenantOnboarding,
  impersonateTenant,
  reactivateTenant,
  softDeleteTenant,
  suspendTenant,
  type AuditEntry,
  type TenantActivity,
  type TenantDetail,
  type TenantOnboarding,
} from '@/lib/api';
import { MasterNavHeader } from '@/components/MasterNavHeader';

const PLAN_OPTIONS = ['starter', 'professional', 'business', 'enterprise'];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('cs-CZ');
}

function fmtBool(b: boolean): string {
  return b ? '✓' : '—';
}

export default function TenantDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [activity, setActivity] = useState<TenantActivity | null>(null);
  const [onboarding, setOnboarding] = useState<TenantOnboarding | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!id) return;
    try {
      const [d, a, o, au] = await Promise.all([
        getTenantDetail(id),
        getTenantActivity(id),
        getTenantOnboarding(id),
        getTenantAudit(id, 20),
      ]);
      setDetail(d);
      setActivity(a);
      setOnboarding(o);
      setAudit(au);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    if (!id) return;
    reload();
  }, [id, router]);

  async function withBusy(action: () => Promise<unknown>) {
    if (!id || busy) return;
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function handleSuspend() {
    const reason = window.prompt('Důvod suspenzace:');
    if (!reason || reason.length < 3) return;
    await withBusy(() => suspendTenant(id!, reason));
  }

  async function handleReactivate() {
    if (!window.confirm('Reaktivovat tenanta?')) return;
    await withBusy(() => reactivateTenant(id!));
  }

  async function handleExtendTrial() {
    const input = window.prompt('O kolik dní prodloužit trial?', '14');
    if (!input) return;
    const days = parseInt(input, 10);
    if (Number.isNaN(days) || days < 1) return;
    await withBusy(() => extendTrial(id!, days));
  }

  async function handleChangePlan() {
    const input = window.prompt(`Nový plán (${PLAN_OPTIONS.join('/')}):`);
    if (!input || !PLAN_OPTIONS.includes(input)) return;
    await withBusy(() => changeTenantPlan(id!, input));
  }

  async function handleDelete() {
    if (
      !window.confirm(
        'Opravdu chcete tenanta soft-smazat? (Lze obnovit přímo v DB nastavením deleted_at na NULL.)',
      )
    ) {
      return;
    }
    await withBusy(() => softDeleteTenant(id!));
  }

  async function handleImpersonate() {
    if (!id) return;
    setBusy(true);
    try {
      const result = await impersonateTenant(id);
      // Predame token tenant admin appce pres URL hash (nikdy v query — kvuli logum)
      const url = `${getAdminBaseUrl()}/#impersonate=${encodeURIComponent(result.accessToken)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <MasterNavHeader />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div>
          <Link href="/tenants" className="text-sm text-brand-700 hover:underline">
            ← Seznam tenantů
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
            {error}
          </div>
        )}

        {!detail && !error && <div className="text-slate-400">Načítám…</div>}

        {detail && (
          <>
            <header className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">{detail.name}</h1>
                <p className="text-slate-500">
                  slug: <span className="font-mono">{detail.slug}</span>
                  {detail.customDomain && ` · ${detail.customDomain}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {!detail.suspendedAt && !detail.deletedAt && (
                  <button
                    type="button"
                    onClick={handleSuspend}
                    disabled={busy}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    Suspendovat
                  </button>
                )}
                {detail.suspendedAt && !detail.deletedAt && (
                  <button
                    type="button"
                    onClick={handleReactivate}
                    disabled={busy}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    Reaktivovat
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExtendTrial}
                  disabled={busy || !!detail.deletedAt}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  Prodloužit trial
                </button>
                <button
                  type="button"
                  onClick={handleChangePlan}
                  disabled={busy || !!detail.deletedAt}
                  className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  Změnit plán
                </button>
                <button
                  type="button"
                  onClick={handleImpersonate}
                  disabled={busy || !!detail.deletedAt || !!detail.suspendedAt}
                  className="bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  Přihlásit jako vlastník
                </button>
                {!detail.deletedAt && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    Smazat
                  </button>
                )}
              </div>
            </header>

            {detail.suspendedAt && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl">
                <strong>Suspendovaný od {fmtDate(detail.suspendedAt)}.</strong>
                {detail.suspensionReason && (
                  <div className="text-sm mt-1">Důvod: {detail.suspensionReason}</div>
                )}
              </div>
            )}
            {detail.deletedAt && (
              <div className="bg-slate-100 border border-slate-200 text-slate-700 p-4 rounded-xl">
                Smazaný od {fmtDate(detail.deletedAt)} (soft-delete).
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <Section title="Základ">
                <DataRow label="Plán" value={detail.plan} />
                <DataRow label="Status" value={detail.status} />
                <DataRow label="Business type" value={detail.businessType ?? '—'} />
                <DataRow label="Owner e-mail" value={detail.ownerEmail ?? '—'} />
                <DataRow
                  label="Lokalizace"
                  value={`${detail.locale} · ${detail.timezone} · ${detail.currency}`}
                />
                <DataRow label="Registrace" value={fmtDate(detail.createdAt)} />
                <DataRow label="Trial do" value={fmtDate(detail.trialEndsAt)} />
                <DataRow label="Poslední aktivita" value={fmtDate(detail.lastActivityAt)} />
              </Section>

              {activity && (
                <Section title="Aktivita">
                  <DataRow label="Rezervace 7 dní" value={String(activity.bookingsLast7Days)} />
                  <DataRow label="Rezervace 30 dní" value={String(activity.bookingsLast30Days)} />
                  <DataRow label="Rezervace 90 dní" value={String(activity.bookingsLast90Days)} />
                  <DataRow label="Celkem rezervací" value={String(activity.totalBookings)} />
                  <DataRow label="Zákazníků" value={String(activity.customersCount)} />
                  <DataRow label="Služeb" value={String(activity.servicesCount)} />
                  <DataRow label="Zaměstnanců" value={String(activity.employeesCount)} />
                  <DataRow label="Poboček" value={String(activity.branchesCount)} />
                  <DataRow
                    label="Poslední rezervace"
                    value={fmtDate(activity.lastBookingCreatedAt)}
                  />
                </Section>
              )}
            </div>

            {onboarding && (
              <Section title="Onboarding checklist">
                <DataRow label="E-mail ověřen" value={fmtBool(onboarding.emailVerified)} />
                <DataRow
                  label="První služba vytvořena"
                  value={fmtBool(onboarding.firstServiceCreated)}
                />
                <DataRow label="Pracovní doba" value={fmtBool(onboarding.workingHoursSet)} />
                <DataRow label="Tým pozván" value={fmtBool(onboarding.teamInvited)} />
                <DataRow label="Platby napojené" value={fmtBool(onboarding.paymentsConnected)} />
                <DataRow label="První rezervace" value={fmtBool(onboarding.firstBookingReceived)} />
                <DataRow label="Dokončeno" value={fmtDate(onboarding.completedAt)} />
              </Section>
            )}

            <Section title="Audit log akcí master adminů">
              {audit.length === 0 ? (
                <p className="text-slate-400">Žádné akce zatím.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2">Kdy</th>
                      <th className="py-2">Admin</th>
                      <th className="py-2">Akce</th>
                      <th className="py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {audit.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 text-slate-500">{fmtDate(a.createdAt)}</td>
                        <td className="py-2">{a.adminEmail ?? a.adminId.slice(0, 8)}</td>
                        <td className="py-2 font-mono text-xs">{a.action}</td>
                        <td className="py-2 text-slate-500 text-xs">
                          {Object.keys(a.payload).length > 0 ? JSON.stringify(a.payload) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-2">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
