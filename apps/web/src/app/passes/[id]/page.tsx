'use client';

// Detail vydané permanentky. V URL je `<typ>-<uuid>` (např. credit-6f0e…), protože
// id je unikátní jen v rámci své tabulky a backend chce typ i id zvlášť.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  adjustBundlePass,
  adjustCreditPass,
  adjustTimePass,
  clearAuth,
  getAccessToken,
  getPass,
  listPassUses,
  listServices,
  resumePass,
  suspendPass,
  type AdminPassDetail,
  type AdminService,
  type PassType,
  type PassUseRow,
} from '@/lib/api';
import { PassStatusBadge, passStatusLabel } from '../PassStatusBadge';

const TYPE_LABEL: Record<PassType, string> = {
  credit: 'Kreditová permanentka',
  bundle: 'Bundle balíček',
  time: 'Časový balíček',
};

const ACTION_LABEL: Record<string, string> = {
  consumed: 'Čerpáno',
  refunded: 'Vráceno',
  penalty: 'Penalizace',
  admin_adjustment: 'Ruční úprava',
  expired_balance: 'Propadlý zůstatek',
  cancelled: 'Zrušeno',
};

function formatPrice(hellers: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(
    hellers / 100,
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Z URL segmentu `credit-<uuid>` vytáhne typ a id. */
function parseParam(raw: string): { type: PassType | null; id: string } {
  const idx = raw.indexOf('-');
  if (idx === -1) return { type: null, id: '' };
  const type = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (type !== 'credit' && type !== 'bundle' && type !== 'time') return { type: null, id: '' };
  return { type, id };
}

export default function PassDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { type, id } = parseParam(params.id);

  const [pass, setPass] = useState<AdminPassDetail | null>(null);
  const [uses, setUses] = useState<PassUseRow[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modály: dobití, prodloužení, pozastavení/obnovení
  const [topUp, setTopUp] = useState<{ delta: string; serviceId: string; note: string } | null>(
    null,
  );
  const [extend, setExtend] = useState<{ days: string; note: string } | null>(null);
  const [suspendForm, setSuspendForm] = useState<{
    action: 'suspend' | 'resume';
    note: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    if (!type) {
      setError('Neplatná adresa permanentky.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [detail, useRows, svc] = await Promise.all([
        getPass(type, id),
        listPassUses(type, id),
        listServices(),
      ]);
      setPass(detail);
      setUses(useRows);
      setServices(svc);
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
  }, [type, id, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleTopUp() {
    if (!topUp || !type) return;
    setFormError(null);
    const delta = Number(topUp.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      setFormError('Zadej celé číslo různé od nuly (např. 5 nebo -2).');
      return;
    }
    if (!topUp.note.trim()) {
      setFormError('Poznámka je povinná.');
      return;
    }
    try {
      if (type === 'credit') {
        await adjustCreditPass(id, { creditsDelta: delta, note: topUp.note.trim() });
      } else if (type === 'bundle') {
        if (!topUp.serviceId) {
          setFormError('U bundle je potřeba vybrat službu.');
          return;
        }
        await adjustBundlePass(id, {
          serviceId: topUp.serviceId,
          quantityDelta: delta,
          note: topUp.note.trim(),
        });
      } else {
        // U časového se „dobíjí" snížením počtu použití.
        await adjustTimePass(id, { bookingsUsedDelta: -delta, note: topUp.note.trim() });
      }
      setTopUp(null);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleExtend() {
    if (!extend || !type) return;
    setFormError(null);
    const days = Number(extend.days);
    if (!Number.isInteger(days) || days === 0) {
      setFormError('Zadej celý počet dnů.');
      return;
    }
    if (!extend.note.trim()) {
      setFormError('Poznámka je povinná.');
      return;
    }
    try {
      const note = extend.note.trim();
      if (type === 'credit') await adjustCreditPass(id, { extendDays: days, note });
      else if (type === 'bundle') await adjustBundlePass(id, { extendDays: days, note });
      else await adjustTimePass(id, { extendDays: days, note });
      setExtend(null);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleSuspendResume() {
    if (!suspendForm || !type) return;
    setFormError(null);
    if (!suspendForm.note.trim()) {
      setFormError('Poznámka je povinná.');
      return;
    }
    try {
      if (suspendForm.action === 'suspend') await suspendPass(type, id, suspendForm.note.trim());
      else await resumePass(type, id, suspendForm.note.trim());
      setSuspendForm(null);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  if (loading && !pass) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 max-w-5xl mx-auto w-full text-slate-500">Načítám…</main>
      </div>
    );
  }

  if (!pass || !type) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-3">
            {error ?? 'Permanentka nenalezena.'}
          </div>
          <Link href="/passes" className="text-brand-600 hover:underline text-sm">
            ← Zpět na permanentky
          </Link>
        </main>
      </div>
    );
  }

  const isSuspended = pass.effectiveStatus === 'suspended';

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <Link href="/passes" className="text-brand-600 hover:underline text-sm">
          ← Zpět na permanentky
        </Link>

        {/* Pozastavená je odlišená rámem i pruhem, ne jen textem ve sloupci. */}
        <div
          className={`mt-2 rounded-xl border p-5 ${
            isSuspended ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold">{pass.packName ?? 'Permanentka'}</h2>
                <PassStatusBadge
                  effectiveStatus={pass.effectiveStatus}
                  storedStatus={pass.storedStatus}
                />
              </div>
              <p className="text-sm text-slate-600 mt-1">
                {TYPE_LABEL[pass.type]}
                {pass.customerId && (
                  <>
                    {' · '}
                    <Link
                      href={`/customers/${pass.customerId}`}
                      className="text-brand-600 hover:underline"
                    >
                      {pass.customerFirstName} {pass.customerLastName}
                    </Link>
                  </>
                )}
                {!pass.customerId && ' · firemní'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => {
                  setFormError(null);
                  setTopUp({ delta: '', serviceId: '', note: '' });
                }}
                className="px-3 py-2 border border-slate-300 rounded font-medium hover:bg-white"
              >
                Dobít
              </button>
              <button
                onClick={() => {
                  setFormError(null);
                  setExtend({ days: '', note: '' });
                }}
                className="px-3 py-2 border border-slate-300 rounded font-medium hover:bg-white"
              >
                Prodloužit platnost
              </button>
              <button
                onClick={() => {
                  setFormError(null);
                  setSuspendForm({ action: isSuspended ? 'resume' : 'suspend', note: '' });
                }}
                className={`px-3 py-2 rounded font-medium border ${
                  isSuspended
                    ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                    : 'border-orange-300 text-orange-800 hover:bg-orange-100'
                }`}
              >
                {isSuspended ? 'Obnovit' : 'Pozastavit'}
              </button>
            </div>
          </div>

          {isSuspended && (
            <p className="text-sm text-orange-900 mt-3">
              Permanentka je pozastavená — při rezervaci se z ní nečerpá, a nezmění to ani zrušení
              rezervace.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Zůstatek</div>
              <div className="text-lg font-bold">{pass.balanceLabel}</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Platnost</div>
              <div className="text-sm font-medium">
                {new Date(pass.validFrom).toLocaleDateString('cs-CZ')} →{' '}
                {pass.validUntil
                  ? new Date(pass.validUntil).toLocaleDateString('cs-CZ')
                  : 'bez expirace'}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Zaplaceno</div>
              <div className="text-lg font-bold">{formatPrice(pass.pricePaidHellers)}</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Prodal</div>
              <div className="text-sm font-medium">{pass.soldByName ?? '—'}</div>
              <div className="text-xs text-slate-500">{formatDateTime(pass.purchasedAt)}</div>
            </div>
          </div>

          {pass.note && <p className="text-sm text-slate-600 italic mt-3">{pass.note}</p>}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mt-4">
            {error}
          </div>
        )}

        {(topUp || extend || suspendForm) && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold mb-4">
                {topUp && (type === 'time' ? 'Dobít použití' : 'Dobít zůstatek')}
                {extend && 'Prodloužit platnost'}
                {suspendForm &&
                  (suspendForm.action === 'suspend'
                    ? 'Pozastavit permanentku'
                    : 'Obnovit permanentku')}
              </h3>
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
                  {formError}
                </div>
              )}

              {topUp && (
                <div className="grid grid-cols-1 gap-3">
                  {type === 'bundle' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Služba *</label>
                      <select
                        value={topUp.serviceId}
                        onChange={(e) => setTopUp({ ...topUp, serviceId: e.target.value })}
                        className="w-full border border-slate-300 rounded px-3 py-2"
                      >
                        <option value="">— vyber službu —</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {type === 'credit' && 'Kredity (+5 přidá, -2 odebere) *'}
                      {type === 'bundle' && 'Kusy (+1 přidá, -1 odebere) *'}
                      {type === 'time' && 'Použití k vrácení (+1 vrátí jedno použití) *'}
                    </label>
                    <input
                      type="number"
                      value={topUp.delta}
                      onChange={(e) => setTopUp({ ...topUp, delta: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-2"
                    />
                  </div>
                </div>
              )}

              {extend && (
                <div>
                  <label className="block text-sm font-medium mb-1">O kolik dnů *</label>
                  <input
                    type="number"
                    value={extend.days}
                    onChange={(e) => setExtend({ ...extend, days: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                  {pass.validUntil === null && (
                    <p className="text-xs text-amber-700 mt-1">
                      Tato permanentka nemá expiraci — prodloužit ji nelze.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">Poznámka *</label>
                <input
                  type="text"
                  placeholder="proč se to mění"
                  value={topUp?.note ?? extend?.note ?? suspendForm?.note ?? ''}
                  onChange={(e) => {
                    if (topUp) setTopUp({ ...topUp, note: e.target.value });
                    else if (extend) setExtend({ ...extend, note: e.target.value });
                    else if (suspendForm) setSuspendForm({ ...suspendForm, note: e.target.value });
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setTopUp(null);
                    setExtend(null);
                    setSuspendForm(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={() => {
                    if (topUp) handleTopUp();
                    else if (extend) handleExtend();
                    else handleSuspendResume();
                  }}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  Potvrdit
                </button>
              </div>
            </div>
          </div>
        )}

        <h3 className="text-lg font-bold mt-8 mb-2">Historie čerpání</h3>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Datum</th>
                <th className="text-left px-4 py-3 font-semibold">Akce</th>
                <th className="text-right px-4 py-3 font-semibold">Počet</th>
                <th className="text-left px-4 py-3 font-semibold">Poznámka</th>
                <th className="text-left px-4 py-3 font-semibold">Rezervace</th>
              </tr>
            </thead>
            <tbody>
              {uses.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    Zatím žádné čerpání.
                  </td>
                </tr>
              )}
              {uses.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">{formatDateTime(u.createdAt)}</td>
                  <td className="px-4 py-3">{ACTION_LABEL[u.action] ?? u.action}</td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${
                      u.amount < 0
                        ? 'text-emerald-700'
                        : u.amount > 0
                          ? 'text-slate-900'
                          : 'text-slate-400'
                    }`}
                  >
                    {u.amount > 0 ? `−${u.amount}` : u.amount < 0 ? `+${Math.abs(u.amount)}` : '0'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.note ?? '—'}</td>
                  <td className="px-4 py-3">
                    {u.bookingId ? (
                      <Link
                        href={`/calendar?bookingId=${u.bookingId}`}
                        className="text-brand-600 hover:underline"
                      >
                        otevřít
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Kladný počet = strženo, zelený záporný = vráceno. Stav „
          {passStatusLabel(pass.effectiveStatus)}" je spočítaný z platnosti a zůstatku.
        </p>
      </main>
    </div>
  );
}
