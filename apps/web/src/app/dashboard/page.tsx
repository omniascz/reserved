'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  getBookingsPerDay,
  getCreditPacksSummary,
  getEmailStats,
  getReportOverview,
  getTopCustomers,
  getTopEmployees,
  getTopServices,
  listBranches,
  type AdminBranch,
  type BookingPerDay,
  type CreditPackSummary,
  type EmailStats,
  type ReportOverviewWithCompare,
  type TopCustomerRow,
  type TopEmployeeRow,
  type TopServiceRow,
} from '@/lib/api';

type Preset = '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: '7d', label: 'Posledních 7 dní' },
  { value: '30d', label: 'Posledních 30 dní' },
  { value: '90d', label: 'Posledních 90 dní' },
  { value: 'this_month', label: 'Tento měsíc' },
  { value: 'last_month', label: 'Minulý měsíc' },
];

function computeRange(preset: Preset, customFrom?: string, customTo?: string) {
  const now = new Date();
  if (preset === 'custom' && customFrom && customTo) {
    return { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() };
  }
  let from = new Date(now);
  let to = new Date(now);
  switch (preset) {
    case '7d':
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'this_month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DashboardPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>('30d');
  const [branchId, setBranchId] = useState<string>('');
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [overview, setOverview] = useState<ReportOverviewWithCompare | null>(null);
  const [perDay, setPerDay] = useState<BookingPerDay[]>([]);
  const [services, setServices] = useState<TopServiceRow[]>([]);
  const [employees, setEmployees] = useState<TopEmployeeRow[]>([]);
  const [customers, setCustomers] = useState<TopCustomerRow[]>([]);
  const [creditSummary, setCreditSummary] = useState<CreditPackSummary[]>([]);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    listBranches()
      .then(setBranches)
      .catch(() => {}); // tichá chyba, dashboard funguje i bez branches
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = computeRange(preset);
      const filters = { from: range.from, to: range.to, branchId: branchId || undefined };
      const [o, pd, s, em, cu, cp, mail] = await Promise.all([
        getReportOverview(filters),
        getBookingsPerDay(filters),
        getTopServices(filters),
        getTopEmployees(filters),
        getTopCustomers(filters),
        getCreditPacksSummary(),
        getEmailStats(filters),
      ]);
      setOverview(o);
      setPerDay(pd);
      setServices(s);
      setEmployees(em);
      setCustomers(cu);
      setCreditSummary(cp);
      setEmailStats(mail);
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) {
        clearAuth();
        router.replace('/login');
      } else if (e instanceof AdminApiError && e.code === 'INSUFFICIENT_ROLE') {
        setError('Dashboard vidí jen owner nebo manager. Zaměstnanci se hlásí jinam.');
      } else {
        setError(e instanceof Error ? e.message : 'Chyba');
      }
    } finally {
      setLoading(false);
    }
  }, [preset, branchId, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  const current = overview?.current;
  const previous = overview?.previous;
  const completionRate =
    current && current.totalBookings > 0
      ? Math.round((current.completedCount / current.totalBookings) * 100)
      : 0;
  const noShowRate =
    current && current.totalBookings > 0
      ? Math.round((current.noShowCount / current.totalBookings) * 100)
      : 0;

  function deltaPct(currentVal: number, previousVal: number): number | null {
    if (previousVal === 0) return currentVal > 0 ? 100 : null;
    return Math.round(((currentVal - previousVal) / previousVal) * 100);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3 no-print">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex gap-2 items-center text-sm">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50"
              title="Vytisknout nebo uložit jako PDF"
            >
              🖨️ Tisk / PDF
            </button>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {branches.length > 1 && (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg"
              >
                <option value="">Všechny pobočky</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading && !overview ? (
          <div className="text-slate-500">Načítám…</div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiCard
                label="Rezervací"
                value={current?.totalBookings ?? 0}
                hint={`${current?.uniqueCustomers ?? 0} unikátních klientů`}
                delta={
                  current && previous
                    ? deltaPct(current.totalBookings, previous.totalBookings)
                    : null
                }
              />
              <KpiCard
                label="Tržby"
                value={`${(((current?.revenueHellers ?? 0) / 100) | 0).toLocaleString('cs-CZ')} Kč`}
                hint="Z dokončených i očekávaných"
                delta={
                  current && previous
                    ? deltaPct(current.revenueHellers, previous.revenueHellers)
                    : null
                }
              />
              <KpiCard
                label="Dokončeno"
                value={`${completionRate}%`}
                hint={`${current?.completedCount ?? 0} rezervací`}
                color="emerald"
              />
              <KpiCard
                label="No-show"
                value={`${noShowRate}%`}
                hint={`${current?.noShowCount ?? 0} klientů nedorazilo`}
                color={noShowRate > 10 ? 'red' : 'slate'}
                delta={
                  current && previous ? deltaPct(current.noShowCount, previous.noShowCount) : null
                }
                deltaInverted // u no-show je vyšší = horší
              />
            </div>

            {/* Bookings per day chart */}
            <Card title="Rezervace v čase">
              {perDay.length === 0 ? (
                <Empty>Žádná data za toto období.</Empty>
              ) : (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <LineChart data={perDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="Rezervací"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <div className="grid lg:grid-cols-2 gap-4 mb-4">
              {/* Top services chart */}
              <Card title="Nejčastější služby">
                {services.length === 0 ? (
                  <Empty>Žádná data.</Empty>
                ) : (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <BarChart data={services.slice(0, 6)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis
                          dataKey="serviceName"
                          type="category"
                          width={120}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip />
                        <Bar dataKey="bookings" fill="#3b82f6" name="Rezervací" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Status distribution pie */}
              <Card title="Stav rezervací">
                {!current || current.totalBookings === 0 ? (
                  <Empty>Žádná data.</Empty>
                ) : (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Dokončeno', value: current.completedCount },
                            { name: 'Potvrzeno', value: current.confirmedCount },
                            { name: 'Zrušeno', value: current.cancelledCount },
                            { name: 'No-show', value: current.noShowCount },
                          ].filter((d) => d.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={(entry) => `${entry.name}: ${entry.value}`}
                        >
                          {[0, 1, 2, 3].map((i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            {/* Top employees */}
            <DataTable
              title="Top zaměstnanci"
              columns={['Zaměstnanec', 'Rezervací', 'Dokončeno', 'Tržby']}
              rows={employees.map((e) => [
                e.name,
                String(e.bookings),
                String(e.completedCount),
                `${((e.revenueHellers / 100) | 0).toLocaleString('cs-CZ')} Kč`,
              ])}
              csvFilename="top-zamestnanci.csv"
            />

            {/* Top customers */}
            <DataTable
              title="Top zákazníci"
              columns={['Zákazník', 'E-mail', 'Rezervací', 'Utraceno', 'No-show']}
              rows={customers.map((c) => [
                c.name,
                c.email,
                String(c.bookings),
                `${((c.spentHellers / 100) | 0).toLocaleString('cs-CZ')} Kč`,
                String(c.noShowCount),
              ])}
              csvFilename="top-zakaznici.csv"
            />

            {/* Credit pack summary */}
            {/* Email / notification stats */}
            {emailStats && emailStats.totals.total > 0 && (
              <Card title={`Notifikace (${emailStats.totals.total})`}>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <KpiCard label="Celkem" value={emailStats.totals.total} />
                  <KpiCard label="Odesláno" value={emailStats.totals.sent} color="emerald" />
                  <KpiCard
                    label="Selhalo"
                    value={emailStats.totals.failed}
                    color={emailStats.totals.failed > 0 ? 'red' : 'slate'}
                  />
                  <KpiCard label="Čeká" value={emailStats.totals.pending} />
                </div>
                {emailStats.perTemplate.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">
                          Šablona
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600">
                          Celkem
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-emerald-700">
                          Odesláno
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-red-700">Selhalo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailStats.perTemplate.map((r) => (
                        <tr key={r.template} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs">{r.template}</td>
                          <td className="px-3 py-2 text-right">{r.total}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{r.sent}</td>
                          <td className="px-3 py-2 text-right text-red-700">{r.failed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            )}

            {creditSummary.length > 0 && (
              <Card title="Permanentky">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {creditSummary.map((s) => (
                    <div
                      key={s.status}
                      className="border border-slate-200 rounded-lg p-3 text-center"
                    >
                      <div className="text-xs text-slate-500 uppercase">
                        {statusLabel(s.status)}
                      </div>
                      <div className="text-2xl font-bold">{s.count}</div>
                      <div className="text-xs text-slate-500">
                        {s.totalCreditsRemaining} kreditů
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  color = 'slate',
  delta,
  deltaInverted = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color?: 'slate' | 'emerald' | 'red';
  delta?: number | null;
  deltaInverted?: boolean;
}) {
  const colorClass =
    color === 'emerald' ? 'text-emerald-600' : color === 'red' ? 'text-red-600' : 'text-slate-900';

  const deltaUp = delta !== null && delta !== undefined && delta > 0;
  const deltaDown = delta !== null && delta !== undefined && delta < 0;
  const isPositive = deltaInverted ? deltaDown : deltaUp;
  const deltaColor = isPositive
    ? 'text-emerald-600'
    : deltaUp || deltaDown
      ? 'text-red-600'
      : 'text-slate-400';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
        {delta !== null && delta !== undefined && (
          <span className={`text-xs font-semibold ${deltaColor}`}>
            {deltaUp ? '↑' : deltaDown ? '↓' : '–'} {Math.abs(delta)}%
          </span>
        )}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-slate-500 text-center py-12 text-sm">{children}</div>;
}

function DataTable({
  title,
  columns,
  rows,
  csvFilename,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  csvFilename: string;
}) {
  function downloadCsv() {
    const csv = [columns, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFilename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card title={title}>
      <div className="flex justify-end mb-2">
        <button
          onClick={downloadCsv}
          disabled={rows.length === 0}
          className="text-sm text-brand-600 hover:text-brand-800 font-medium disabled:opacity-50"
        >
          Stáhnout CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty>Žádná data.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {columns.map((c) => (
                  <th key={c} className="text-left px-3 py-2 font-semibold text-slate-600">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((row, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function statusLabel(status: string): string {
  return (
    {
      active: 'Aktivní',
      expired: 'Vypršelé',
      used_up: 'Vyčerpané',
      refunded: 'Vrácené',
      cancelled: 'Zrušené',
    }[status] ?? status
  );
}
