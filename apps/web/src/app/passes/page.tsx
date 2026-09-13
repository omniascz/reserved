'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  allocateBundlePack,
  allocateCreditPack,
  allocateTimePack,
  clearAuth,
  getAccessToken,
  listBundlePacks,
  listCreditPacks,
  listCustomers,
  listPasses,
  listTimePacks,
  type AdminBundlePack,
  type AdminCreditPack,
  type AdminCustomer,
  type AdminPass,
  type AdminTimePack,
  type PassEffectiveStatus,
  type PassType,
} from '@/lib/api';
import { PassStatusBadge } from './PassStatusBadge';

const TYPE_LABEL: Record<PassType, string> = {
  credit: 'Kreditová',
  bundle: 'Bundle',
  time: 'Časová',
};

const STATUS_OPTIONS: Array<{ value: PassEffectiveStatus; label: string }> = [
  { value: 'active', label: 'Aktivní' },
  { value: 'expired', label: 'Propadlé' },
  { value: 'used_up', label: 'Vyčerpané' },
  { value: 'suspended', label: 'Pozastavené' },
  { value: 'rolled_over', label: 'Přenesené' },
  { value: 'cancelled', label: 'Zrušené' },
  { value: 'refunded', label: 'Vrácené' },
];

const PAGE_SIZE = 25;

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'bez expirace';
  return new Date(iso).toLocaleDateString('cs-CZ');
}

interface IssueForm {
  customerId: string;
  type: PassType;
  templateId: string;
  priceOverride: string;
  note: string;
}

const EMPTY_ISSUE: IssueForm = {
  customerId: '',
  type: 'credit',
  templateId: '',
  priceOverride: '',
  note: '',
};

export default function PassesPage({
  searchParams,
}: {
  // Parametry z URL propem — ne useSearchParams (ten bez <Suspense> rozbíjí prerender).
  searchParams?: { type?: string; status?: string; packId?: string; customerId?: string };
}) {
  const router = useRouter();
  const [passes, setPasses] = useState<AdminPass[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const packId = searchParams?.packId ?? '';
  const initialType = (['credit', 'bundle', 'time'] as const).includes(
    searchParams?.type as PassType,
  )
    ? (searchParams?.type as PassType)
    : '';
  const initialStatus = STATUS_OPTIONS.some((o) => o.value === searchParams?.status)
    ? (searchParams?.status as PassEffectiveStatus)
    : '';

  const [type, setType] = useState<PassType | ''>(initialType);
  const [status, setStatus] = useState<PassEffectiveStatus | ''>(initialStatus);
  const [search, setSearch] = useState('');
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [offset, setOffset] = useState(0);

  // Formulář „vydat permanentku"
  const [issue, setIssue] = useState<IssueForm | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [creditTemplates, setCreditTemplates] = useState<AdminCreditPack[]>([]);
  const [bundleTemplates, setBundleTemplates] = useState<AdminBundlePack[]>([]);
  const [timeTemplates, setTimeTemplates] = useState<AdminTimePack[]>([]);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPasses({
        type: type || undefined,
        status: status || undefined,
        packId: packId || undefined,
        customerId: searchParams?.customerId || undefined,
        search: search.trim() || undefined,
        expiringWithinDays: expiringSoon ? 30 : undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setPasses(res.items);
      setTotal(res.total);
      setHasMore(res.hasMore);
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
  }, [router, type, status, packId, searchParams?.customerId, search, expiringSoon, offset]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function openIssue() {
    setIssueError(null);
    setIssue({ ...EMPTY_ISSUE });
    try {
      const [cust, credit, bundle, time] = await Promise.all([
        listCustomers({}),
        listCreditPacks(),
        listBundlePacks(),
        listTimePacks(),
      ]);
      setCustomers(cust);
      setCreditTemplates(credit.filter((t) => t.isActive));
      setBundleTemplates(bundle.filter((t) => t.isActive));
      setTimeTemplates(time.filter((t) => t.isActive));
    } catch (e) {
      setIssueError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleIssue() {
    if (!issue) return;
    setIssueError(null);
    if (!issue.customerId) {
      setIssueError('Vyber klienta.');
      return;
    }
    if (!issue.templateId) {
      setIssueError('Vyber šablonu.');
      return;
    }
    const common: { pricePaidHellers?: number; note?: string } = {};
    if (issue.priceOverride) {
      common.pricePaidHellers = Math.round(Number(issue.priceOverride) * 100);
    }
    if (issue.note.trim()) common.note = issue.note.trim();

    try {
      if (issue.type === 'credit') {
        await allocateCreditPack(issue.customerId, { creditPackId: issue.templateId, ...common });
      } else if (issue.type === 'bundle') {
        await allocateBundlePack(issue.customerId, { bundlePackId: issue.templateId, ...common });
      } else {
        await allocateTimePack(issue.customerId, { timePackId: issue.templateId, ...common });
      }
      setIssue(null);
      setOffset(0);
      reload();
    } catch (e) {
      setIssueError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  const templatesForType =
    issue?.type === 'credit'
      ? creditTemplates.map((t) => ({ id: t.id, label: `${t.name} · ${t.totalCredits} kreditů` }))
      : issue?.type === 'bundle'
        ? bundleTemplates.map((t) => ({ id: t.id, label: t.name }))
        : timeTemplates.map((t) => ({ id: t.id, label: `${t.name} · ${t.durationDays} dní` }));

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Vydané permanentky</h2>
            <p className="text-sm text-slate-500">
              Co mají klienti zaplacené a kolik jim zbývá. Stav se počítá z platnosti a zůstatku, ne
              z databázového sloupce.
            </p>
          </div>
          <button
            onClick={openIssue}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Vydat permanentku
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {(packId || searchParams?.customerId) && (
          <div className="bg-brand-50 border border-brand-200 text-brand-900 text-sm p-3 rounded mb-4 flex items-center justify-between">
            <span>
              {packId
                ? 'Zobrazuji jen permanentky vydané z jedné šablony.'
                : 'Zobrazuji jen permanentky jednoho klienta.'}
            </span>
            <Link href="/passes" className="underline font-medium">
              Zrušit filtr
            </Link>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Typ</label>
            <select
              value={type}
              onChange={(e) => {
                setOffset(0);
                setType(e.target.value as PassType | '');
              }}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Všechny</option>
              <option value="credit">Kreditové</option>
              <option value="bundle">Bundle</option>
              <option value="time">Časové</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Stav</label>
            <select
              value={status}
              onChange={(e) => {
                setOffset(0);
                setStatus(e.target.value as PassEffectiveStatus | '');
              }}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Všechny</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Klient</label>
            <input
              type="text"
              placeholder="jméno nebo e-mail"
              value={search}
              onChange={(e) => {
                setOffset(0);
                setSearch(e.target.value);
              }}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={expiringSoon}
                onChange={(e) => {
                  setOffset(0);
                  setExpiringSoon(e.target.checked);
                }}
              />
              Propadá do 30 dnů
            </label>
          </div>
        </div>

        {issue && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Vydat permanentku</h3>
              {issueError && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
                  {issueError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Klient *</label>
                  <select
                    value={issue.customerId}
                    onChange={(e) => setIssue({ ...issue, customerId: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="">— vyber klienta —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName} · {c.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Typ *</label>
                  <select
                    value={issue.type}
                    onChange={(e) =>
                      setIssue({ ...issue, type: e.target.value as PassType, templateId: '' })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="credit">Kreditová permanentka</option>
                    <option value="bundle">Bundle balíček</option>
                    <option value="time">Časový balíček</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Šablona *</label>
                  <select
                    value={issue.templateId}
                    onChange={(e) => setIssue({ ...issue, templateId: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="">— vyber šablonu —</option>
                    {templatesForType.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {templatesForType.length === 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      Pro tento typ není žádná aktivní šablona.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Cena (Kč)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="prázdné = cena ze šablony"
                    value={issue.priceOverride}
                    onChange={(e) => setIssue({ ...issue, priceOverride: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Poznámka</label>
                  <input
                    type="text"
                    placeholder="např. dárek za pátou návštěvu"
                    value={issue.note}
                    onChange={(e) => setIssue({ ...issue, note: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setIssue(null)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleIssue}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  Vydat
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Klient</th>
                <th className="text-left px-4 py-3 font-semibold">Typ</th>
                <th className="text-left px-4 py-3 font-semibold">Název</th>
                <th className="text-left px-4 py-3 font-semibold">Zůstatek</th>
                <th className="text-left px-4 py-3 font-semibold">Platí do</th>
                <th className="text-left px-4 py-3 font-semibold">Stav</th>
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
              {!loading && passes.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Žádné permanentky v tomto filtru.
                  </td>
                </tr>
              )}
              {passes.map((p) => (
                <tr
                  key={`${p.type}-${p.id}`}
                  className={`border-b border-slate-100 ${
                    p.effectiveStatus === 'suspended' ? 'bg-orange-50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    {p.customerId ? (
                      <>
                        <div className="font-medium">
                          {p.customerFirstName} {p.customerLastName}
                        </div>
                        <div className="text-xs text-slate-500">{p.customerEmail}</div>
                      </>
                    ) : (
                      <span className="text-slate-500">firemní</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{TYPE_LABEL[p.type]}</td>
                  <td className="px-4 py-3">{p.packName ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{p.balanceLabel}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(p.validUntil)}</td>
                  <td className="px-4 py-3">
                    <PassStatusBadge
                      effectiveStatus={p.effectiveStatus}
                      storedStatus={p.storedStatus}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/passes/${p.type}-${p.id}`}
                      className="text-brand-600 hover:underline text-sm"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
          <span>
            {total > 0 ? `${offset + 1}–${offset + passes.length} z ${total}` : 'Žádné permanentky'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1.5 border border-slate-300 rounded disabled:opacity-40"
            >
              Předchozí
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!hasMore}
              className="px-3 py-1.5 border border-slate-300 rounded disabled:opacity-40"
            >
              Další
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
