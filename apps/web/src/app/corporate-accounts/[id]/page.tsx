'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  addCorporateMember,
  allocateBundlePackToCorporate,
  allocateCreditPackToCorporate,
  allocateTimePackToCorporate,
  clearAuth,
  getAccessToken,
  getCorporateAccount,
  getCorporateSummary,
  getCorporateUsageReport,
  listBundlePacks,
  listCorporateMembers,
  listCreditPacks,
  listCustomers,
  listTimePacks,
  removeCorporateMember,
  type AdminBundlePack,
  type AdminCorporateAccount,
  type AdminCorporateMember,
  type AdminCorporateSummary,
  type AdminCorporateUsageReport,
  type AdminCreditPack,
  type AdminCustomer,
  type AdminTimePack,
} from '@/lib/api';

function formatPrice(hellers: number, currency = 'CZK'): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(hellers / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CorporateAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [account, setAccount] = useState<AdminCorporateAccount | null>(null);
  const [members, setMembers] = useState<AdminCorporateMember[]>([]);
  const [summary, setSummary] = useState<AdminCorporateSummary | null>(null);
  const [report, setReport] = useState<AdminCorporateUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddMember, setShowAddMember] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<AdminCustomer[]>([]);

  const [allocateType, setAllocateType] = useState<'credit' | 'bundle' | 'time' | null>(null);
  const [creditTemplates, setCreditTemplates] = useState<AdminCreditPack[]>([]);
  const [bundleTemplates, setBundleTemplates] = useState<AdminBundlePack[]>([]);
  const [timeTemplates, setTimeTemplates] = useState<AdminTimePack[]>([]);
  const [allocateForm, setAllocateForm] = useState<{
    templateId: string;
    pricePaidHellers: string;
    note: string;
  }>({ templateId: '', pricePaidHellers: '', note: '' });

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [acc, mem, sum, rep] = await Promise.all([
        getCorporateAccount(id),
        listCorporateMembers(id),
        getCorporateSummary(id),
        getCorporateUsageReport(id),
      ]);
      setAccount(acc);
      setMembers(mem);
      setSummary(sum);
      setReport(rep);
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
  }, [id, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function searchCustomers(q: string) {
    setCustomerSearch(q);
    if (q.length < 2) {
      setCustomerOptions([]);
      return;
    }
    try {
      const data = await listCustomers({ search: q });
      // Vyfiltruj uz pridane cleny
      const existing = new Set(members.map((m) => m.customerId));
      setCustomerOptions(data.filter((c) => !existing.has(c.id)));
    } catch {
      setCustomerOptions([]);
    }
  }

  async function handleAddMember(customerId: string) {
    try {
      await addCorporateMember(id, { customerId, role: 'member' });
      setShowAddMember(false);
      setCustomerSearch('');
      setCustomerOptions([]);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function openAllocate(type: 'credit' | 'bundle' | 'time') {
    setAllocateType(type);
    setAllocateForm({ templateId: '', pricePaidHellers: '', note: '' });
    try {
      if (type === 'credit' && creditTemplates.length === 0) {
        setCreditTemplates((await listCreditPacks()).filter((t) => t.isActive));
      } else if (type === 'bundle' && bundleTemplates.length === 0) {
        setBundleTemplates((await listBundlePacks()).filter((t) => t.isActive));
      } else if (type === 'time' && timeTemplates.length === 0) {
        setTimeTemplates((await listTimePacks()).filter((t) => t.isActive));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleAllocateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allocateType || !allocateForm.templateId) return;
    const note = allocateForm.note.trim() || undefined;
    const pricePaidHellers = allocateForm.pricePaidHellers
      ? Math.round(Number(allocateForm.pricePaidHellers) * 100)
      : undefined;
    try {
      if (allocateType === 'credit') {
        await allocateCreditPackToCorporate(id, {
          creditPackId: allocateForm.templateId,
          pricePaidHellers,
          note,
        });
      } else if (allocateType === 'bundle') {
        await allocateBundlePackToCorporate(id, {
          bundlePackId: allocateForm.templateId,
          pricePaidHellers,
          note,
        });
      } else if (allocateType === 'time') {
        await allocateTimePackToCorporate(id, {
          timePackId: allocateForm.templateId,
          pricePaidHellers,
          note,
        });
      }
      setAllocateType(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Odebrat člena z firmy?')) return;
    try {
      await removeCorporateMember(memberId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <NavHeader />
        <main className="p-6 max-w-6xl mx-auto">
          <p className="text-slate-500">Načítám...</p>
        </main>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-slate-50">
        <NavHeader />
        <main className="p-6 max-w-6xl mx-auto">
          <p className="text-red-600">{error ?? 'Firma nenalezena'}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      <main className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <Link href="/corporate-accounts" className="text-sm text-brand-600 hover:underline">
            ← Zpět na seznam firem
          </Link>
          <h2 className="text-2xl font-bold mt-2">{account.companyName}</h2>
          <div className="text-sm text-slate-600 mt-1 space-x-4">
            {account.vatId && <span>DIČ: {account.vatId}</span>}
            {account.companyRegId && <span>IČO: {account.companyRegId}</span>}
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                account.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {account.isActive ? 'aktivní' : 'neaktivní'}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded">
            {error}
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Aktivní členové" value={summary.activeMembers.toString()} />
            <SummaryCard
              label="Permanentky"
              value={`${summary.creditPacks.active}/${summary.creditPacks.total}`}
              sub={`Zbývá ${summary.creditPacks.remainingCredits} kreditů`}
            />
            <SummaryCard
              label="Bundle balíčky"
              value={`${summary.bundlePacks.active}/${summary.bundlePacks.total}`}
              sub={`Zbývá ${summary.bundlePacks.remainingItems} položek`}
            />
            <SummaryCard
              label="Časové balíčky"
              value={`${summary.timePacks.active}/${summary.timePacks.total}`}
              sub={formatPrice(summary.timePacks.totalSpentHellers)}
            />
            <SummaryCard
              label="Celkem utraceno"
              value={formatPrice(summary.totalSpentHellers)}
              highlight
            />
          </div>
        )}

        {/* Allocate balíček */}
        <section className="bg-white border border-slate-200 rounded p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Prodat firmě balíček</h3>
            <div className="flex gap-2">
              <button
                onClick={() => openAllocate('credit')}
                className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1.5 rounded font-medium"
              >
                + Permanentka
              </button>
              <button
                onClick={() => openAllocate('bundle')}
                className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-1.5 rounded font-medium"
              >
                + Bundle
              </button>
              <button
                onClick={() => openAllocate('time')}
                className="text-sm bg-green-100 hover:bg-green-200 text-green-800 px-3 py-1.5 rounded font-medium"
              >
                + Časový
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Balíček bude sdílený mezi všemi aktivními členy firmy. Členové z něj čerpají při svých
            rezervacích.
          </p>
        </section>

        {/* Members */}
        <section className="bg-white border border-slate-200 rounded">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold">Členové firmy ({members.length})</h3>
            <button
              onClick={() => setShowAddMember(true)}
              className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded font-medium"
            >
              Přidat člena
            </button>
          </div>
          {members.length === 0 ? (
            <p className="p-4 text-slate-500 text-sm">Žádní členové.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2">Jméno</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Připojen</th>
                  <th className="px-4 py-2 text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      {m.customer.firstName} {m.customer.lastName}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{m.customer.email}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{m.role}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(m.joinedAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="text-red-600 hover:underline text-xs"
                      >
                        Odebrat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Usage report */}
        {report && (
          <section className="bg-white border border-slate-200 rounded">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold">Čerpání ({report.totalUsages})</h3>
            </div>
            {report.usages.length === 0 ? (
              <p className="p-4 text-slate-500 text-sm">Žádné čerpání zatím.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Kdy</th>
                    <th className="px-4 py-2">Kdo</th>
                    <th className="px-4 py-2">Typ</th>
                    <th className="px-4 py-2">Akce</th>
                    <th className="px-4 py-2 text-right">Kvantita</th>
                  </tr>
                </thead>
                <tbody>
                  {report.usages.slice(0, 50).map((u) => (
                    <tr key={`${u.type}-${u.useId}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-600">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-2">{u.customerName ?? '—'}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            u.type === 'credit'
                              ? 'bg-blue-100 text-blue-800'
                              : u.type === 'bundle'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {u.type === 'credit'
                            ? 'permanentka'
                            : u.type === 'bundle'
                              ? 'bundle'
                              : 'časový'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{u.action}</td>
                      <td className="px-4 py-2 text-right">{u.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {report.usages.length > 50 && (
              <p className="px-4 py-2 text-xs text-slate-500 border-t">
                Zobrazeno prvních 50 z {report.usages.length}
              </p>
            )}
          </section>
        )}

        {/* Allocate modal */}
        {allocateType && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
            <form
              onSubmit={handleAllocateSubmit}
              className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            >
              <h3 className="text-lg font-bold mb-4">
                Prodat{' '}
                {allocateType === 'credit'
                  ? 'permanentku'
                  : allocateType === 'bundle'
                    ? 'bundle balíček'
                    : 'časový balíček'}{' '}
                firmě
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Šablona</label>
                  <select
                    required
                    value={allocateForm.templateId}
                    onChange={(e) =>
                      setAllocateForm({ ...allocateForm, templateId: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  >
                    <option value="">— vyber —</option>
                    {(allocateType === 'credit'
                      ? creditTemplates
                      : allocateType === 'bundle'
                        ? bundleTemplates
                        : timeTemplates
                    ).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({formatPrice(t.priceHellers)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Cena (Kč) — prázdné = default
                  </label>
                  <input
                    type="number"
                    value={allocateForm.pricePaidHellers}
                    onChange={(e) =>
                      setAllocateForm({ ...allocateForm, pricePaidHellers: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Poznámka</label>
                  <input
                    type="text"
                    value={allocateForm.note}
                    onChange={(e) => setAllocateForm({ ...allocateForm, note: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setAllocateType(null)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={!allocateForm.templateId}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white rounded font-medium"
                >
                  Prodat
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Add member modal */}
        {showAddMember && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold mb-4">Přidat člena</h3>
              <input
                type="text"
                placeholder="Hledat zákazníka (jméno, email)..."
                value={customerSearch}
                onChange={(e) => searchCustomers(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 mb-3"
                autoFocus
              />
              <div className="max-h-64 overflow-y-auto border border-slate-100 rounded">
                {customerOptions.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">
                    {customerSearch.length < 2
                      ? 'Zadej alespoň 2 znaky'
                      : 'Žádný zákazník nenalezen'}
                  </p>
                ) : (
                  customerOptions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleAddMember(c.id)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 text-sm"
                    >
                      <div className="font-medium">
                        {c.firstName} {c.lastName}
                      </div>
                      <div className="text-xs text-slate-500">{c.email}</div>
                    </button>
                  ))
                )}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => {
                    setShowAddMember(false);
                    setCustomerSearch('');
                    setCustomerOptions([]);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`border rounded p-3 ${
        highlight ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200'
      }`}
    >
      <div className="text-xs text-slate-500 uppercase">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
