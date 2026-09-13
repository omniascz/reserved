'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  addCustomerNote,
  addCustomerTag,
  AdminApiError,
  clearAuth,
  getAccessToken,
  getCustomerDetail,
  removeCustomerTag,
  eraseCustomerGdpr,
  exportCustomerGdpr,
  type AdminCustomerDetail,
  type GdprEraseResult,
} from '@/lib/api';
import { NoShowRiskBadge } from '@/components/NoShowRiskBadge';
import { CustomerBundlePacks } from './CustomerBundlePacks';
import { CustomerCreditPacks } from './CustomerCreditPacks';
import { CustomerPayments } from './CustomerPayments';
import { CustomerSubscriptions } from './CustomerSubscriptions';
import { CustomerTimePacks } from './CustomerTimePacks';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Čeká',
  confirmed: 'Potvrzeno',
  completed: 'Dokončeno',
  cancelled: 'Zrušeno',
  no_show: 'Nepřišel',
};

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');
  const [newNote, setNewNote] = useState('');
  // GDPR panel
  const [gdprBusy, setGdprBusy] = useState(false);
  const [gdprSummary, setGdprSummary] = useState<string | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseReason, setEraseReason] = useState('');
  const [eraseResult, setEraseResult] = useState<GdprEraseResult | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    try {
      const data = await getCustomerDetail(params.id);
      setDetail(data);
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) {
        clearAuth();
        router.replace('/login');
      } else if (e instanceof AdminApiError && e.status === 404) {
        setError('Zákazník neexistuje.');
      } else {
        setError(e instanceof Error ? e.message : 'Chyba');
      }
    }
  }, [params.id, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const tag = newTag.trim();
    if (!tag) return;
    try {
      await addCustomerTag(params.id, tag);
      setNewTag('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
    }
  }

  async function handleRemoveTag(tag: string) {
    try {
      await removeCustomerTag(params.id, tag);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    const note = newNote.trim();
    if (!note) return;
    try {
      await addCustomerNote(params.id, note);
      setNewNote('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
    }
  }

  async function handleGdprExport() {
    setGdprBusy(true);
    setGdprSummary(null);
    try {
      const exportData = await exportCustomerGdpr(params.id);
      const celkem = Object.values(exportData.pocty).reduce((a, b) => a + b, 0);
      const tabulek = Object.keys(exportData.pocty).length;

      // Stažení souboru — export má být strojově čitelný a předatelný.
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gdpr-export-${params.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setGdprSummary(`Export připraven: ${celkem} záznamů v ${tabulek} tabulkách.`);
    } catch (err) {
      setGdprSummary(err instanceof Error ? `Export selhal: ${err.message}` : 'Export selhal.');
    } finally {
      setGdprBusy(false);
    }
  }

  async function handleGdprErase() {
    setGdprBusy(true);
    try {
      const vysledek = await eraseCustomerGdpr(params.id, eraseReason.trim() || undefined);
      setEraseResult(vysledek);
      setEraseOpen(false);
      setEraseReason('');
      reload();
    } catch (err) {
      setGdprSummary(err instanceof Error ? `Výmaz selhal: ${err.message}` : 'Výmaz selhal.');
    } finally {
      setGdprBusy(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6">
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded">{error}</div>
        </main>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 text-slate-400">Načítám…</main>
      </div>
    );
  }

  const c = detail.customer;
  const totalSpent = (detail.stats.totalSpentHellers / 100).toLocaleString('cs-CZ');

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">
              {c.firstName} {c.lastName}
            </h2>
            <p className="text-sm text-slate-500">
              {c.email} {c.phone && `· ${c.phone}`}
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← Zpět
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Rezervací celkem" value={detail.stats.totalBookings} />
          <StatCard
            label="Dokončeno"
            value={detail.stats.completedCount}
            color="text-emerald-600"
          />
          <StatCard
            label="Utraceno"
            value={`${totalSpent} ${c.metadata && 'currency' in c.metadata ? '' : 'Kč'}`}
          />
        </div>

        {/* No-show risk panel (Sprint 8.0-2) */}
        <div className="mb-6">
          <NoShowRiskBadge customerId={c.id} showDetails />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* TAGS */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold mb-3">Štítky</h3>
            <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
              {detail.tags.length === 0 && (
                <span className="text-sm text-slate-400">Bez štítků</span>
              )}
              {detail.tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full text-xs"
                  style={t.color ? { backgroundColor: `${t.color}22`, color: t.color } : undefined}
                >
                  {t.tag}
                  <button
                    onClick={() => handleRemoveTag(t.tag)}
                    className="text-slate-500 hover:text-red-600"
                    aria-label="Odstranit štítek"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={handleAddTag} className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="VIP, alergie, firemní…"
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded"
              >
                Přidat
              </button>
            </form>
          </div>

          {/* NOTES */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold mb-3">Poznámky</h3>
            <form onSubmit={handleAddNote} className="mb-3 space-y-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Např. Klientka preferuje delší konzultaci…"
                rows={2}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
              />
              <button
                type="submit"
                disabled={!newNote.trim()}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm rounded"
              >
                Uložit poznámku
              </button>
            </form>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {detail.notes.length === 0 && (
                <li className="text-sm text-slate-400">Žádné poznámky</li>
              )}
              {detail.notes.map((n) => (
                <li key={n.id} className="border-l-2 border-slate-200 pl-3 py-1">
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{n.note}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(n.createdAt).toLocaleString('cs-CZ')} · {n.category}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* BOOKING HISTORY */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mt-6">
          <h3 className="font-semibold mb-3">Historie rezervací ({detail.bookings.length})</h3>
          {detail.bookings.length === 0 ? (
            <p className="text-sm text-slate-400">Žádné rezervace.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {detail.bookings.map((b) => (
                <li key={b.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {new Date(b.startsAt).toLocaleString('cs-CZ', {
                        timeZone: 'Europe/Prague',
                      })}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{b.referenceCode}</div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-700">
                      {(b.pricePaidHellers / 100).toLocaleString('cs-CZ')} Kč
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        b.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : b.status === 'cancelled'
                            ? 'bg-slate-200 text-slate-700'
                            : b.status === 'no_show'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {STATUS_LABEL[b.status] ?? b.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6">
          <CustomerCreditPacks customerId={params.id} />
        </div>

        <div className="mt-6">
          <CustomerBundlePacks customerId={params.id} />
        </div>

        <div className="mt-6">
          <CustomerTimePacks customerId={params.id} />
        </div>

        <div className="mt-6">
          <CustomerSubscriptions customerId={params.id} />
        </div>

        <div className="mt-6">
          <CustomerPayments customerId={params.id} />
        </div>

        {/* GDPR — export a výmaz osobních údajů */}
        <div
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mt-6"
          data-testid="gdpr-panel"
        >
          <h3 className="font-semibold mb-1">Osobní údaje (GDPR)</h3>
          <p className="text-sm text-slate-500 mb-3">
            Export vydá vše, co o zákazníkovi systém má. Výmaz osobní údaje odstraní, ale rezervace
            a platby zůstanou kvůli účetnictví — jen už nikoho neidentifikují.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleGdprExport}
              disabled={gdprBusy}
              data-testid="gdpr-export"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm rounded"
            >
              Exportovat údaje
            </button>
            <button
              onClick={() => setEraseOpen(true)}
              disabled={gdprBusy}
              data-testid="gdpr-erase"
              className="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 text-sm rounded"
            >
              Vymazat osobní údaje
            </button>
          </div>

          {gdprSummary && (
            <p className="text-sm text-slate-700 mt-3" data-testid="gdpr-export-summary">
              {gdprSummary}
            </p>
          )}

          {eraseOpen && (
            <div
              className="mt-4 border border-red-200 bg-red-50 rounded p-3"
              data-testid="gdpr-erase-confirm"
            >
              <p className="text-sm text-red-800 font-medium mb-2">
                Opravdu vymazat osobní údaje tohoto zákazníka? Nejde to vzít zpět.
              </p>
              <input
                type="text"
                value={eraseReason}
                onChange={(e) => setEraseReason(e.target.value)}
                placeholder="Důvod (např. žádost zákazníka)"
                data-testid="gdpr-erase-reason"
                className="w-full px-3 py-1.5 border border-red-300 rounded text-sm mb-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleGdprErase}
                  disabled={gdprBusy}
                  data-testid="gdpr-erase-submit"
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded"
                >
                  Potvrdit výmaz
                </button>
                <button
                  onClick={() => setEraseOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 text-sm rounded"
                >
                  Zrušit
                </button>
              </div>
            </div>
          )}

          {eraseResult && (
            <div
              className="mt-4 border border-slate-200 rounded p-3 text-sm"
              data-testid="gdpr-erase-result"
            >
              <p className="font-medium text-slate-800 mb-1">Osobní údaje byly vymazány.</p>
              <p className="text-slate-600">
                Anonymizováno záznamů:{' '}
                {Object.values(eraseResult.anonymizovano).reduce((a, b) => a + b, 0)} · smazáno:{' '}
                {Object.values(eraseResult.smazano).reduce((a, b) => a + b, 0)}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
