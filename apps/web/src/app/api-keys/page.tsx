'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  API_KEY_SCOPES,
  AdminApiError,
  createApiKey,
  getAccessToken,
  listApiKeys,
  revokeApiKey,
  type AdminApiKey,
  type AdminApiKeyCreated,
  type AdminApiKeyScope,
} from '@/lib/api';
import { NavHeader } from '@/components/NavHeader';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('cs-CZ');
}

export default function ApiKeysPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<AdminApiKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [justCreated, setJustCreated] = useState<AdminApiKeyCreated | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const data = await listApiKeys();
      setKeys(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba načítání');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(key: AdminApiKey) {
    if (!confirm(`Opravdu zneplatnit klíč "${key.name}"? Tato akce je trvalá.`)) return;
    try {
      await revokeApiKey(key.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="min-h-screen">
      <NavHeader />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">API klíče</h1>
            <p className="text-slate-500 text-sm mt-1">
              Pro programatický přístup k Reserved API z vlastních systémů (e-shop, mobilní appka,
              CRM). Dokumentace:{' '}
              <a
                href="http://localhost:4000/api-docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                /api-docs
              </a>
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Vytvořit klíč
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
            {error}
          </div>
        )}

        {justCreated && (
          <CreatedKeyAlert created={justCreated} onClose={() => setJustCreated(null)} />
        )}

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Název</th>
                <th className="px-4 py-2">Klíč</th>
                <th className="px-4 py-2">Scopes</th>
                <th className="px-4 py-2">Použití</th>
                <th className="px-4 py-2">Vytvořen</th>
                <th className="px-4 py-2">Stav</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    Načítám…
                  </td>
                </tr>
              )}
              {!loading && keys.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    Žádné API klíče. Vytvoř první kliknutím nahoře.
                  </td>
                </tr>
              )}
              {keys.map((k) => {
                const isRevoked = !!k.revokedAt;
                const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date();
                return (
                  <tr key={k.id} className={isRevoked || isExpired ? 'opacity-50' : ''}>
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{k.keyPrefix}…</td>
                    <td className="px-4 py-3 text-xs">
                      {k.scopes.includes('*') ? (
                        <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded">
                          full access
                        </span>
                      ) : (
                        <span className="text-slate-600">
                          {k.scopes.length} scope{k.scopes.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {k.usageCount > 0 ? (
                        <>
                          {k.usageCount}× · {fmtDate(k.lastUsedAt)}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(k.createdAt)}</td>
                    <td className="px-4 py-3">
                      {isRevoked ? (
                        <span className="text-red-600 text-xs">Zneplatněn</span>
                      ) : isExpired ? (
                        <span className="text-orange-600 text-xs">Expiroval</span>
                      ) : (
                        <span className="text-green-600 text-xs">Aktivní</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isRevoked && (
                        <button
                          onClick={() => handleRevoke(k)}
                          className="text-red-600 hover:text-red-700 text-xs font-medium"
                        >
                          Zneplatnit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {showCreate && (
          <CreateKeyModal
            onClose={() => setShowCreate(false)}
            onCreated={(created) => {
              setJustCreated(created);
              setShowCreate(false);
              load();
            }}
          />
        )}
      </main>
    </div>
  );
}

function CreatedKeyAlert({
  created,
  onClose,
}: {
  created: AdminApiKeyCreated;
  onClose: () => void;
}) {
  return (
    <section className="bg-green-50 border-2 border-green-300 rounded-xl p-5">
      <h3 className="font-bold text-green-900 mb-2">✓ Klíč vytvořen</h3>
      <p className="text-sm text-green-800 mb-3">
        <strong>Zkopíruj si ho TEĎ.</strong> Po zavření této hlášky už ho nikde nezobrazíme — z
        bezpečnosti ukládáme jen hash.
      </p>
      <div className="bg-white border border-green-300 rounded p-3 font-mono text-sm break-all mb-3 select-all">
        {created.rawKey}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => navigator.clipboard.writeText(created.rawKey)}
          className="bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded text-sm font-medium"
        >
          Zkopírovat do schránky
        </button>
        <button
          onClick={onClose}
          className="bg-white border border-green-300 hover:bg-green-100 px-3 py-1.5 rounded text-sm"
        >
          Uložil jsem, zavřít
        </button>
      </div>
    </section>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: AdminApiKeyCreated) => void;
}) {
  const [name, setName] = useState('');
  const [fullAccess, setFullAccess] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<AdminApiKeyScope[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleScope(scope: AdminApiKeyScope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setErr(null);
    if (name.length < 3) {
      setErr('Název musí mít alespoň 3 znaky.');
      return;
    }
    const scopes = fullAccess ? (['*'] as AdminApiKeyScope[]) : selectedScopes;
    if (!fullAccess && scopes.length === 0) {
      setErr('Vyber aspoň jeden scope nebo zapni Full access.');
      return;
    }
    setBusy(true);
    try {
      const created = await createApiKey({ name, scopes });
      onCreated(created);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : 'Chyba při vytváření');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold mb-3">Vytvořit API klíč</h2>
        {err && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-2 rounded mb-3">
            {err}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Název klíče</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Např. 'Můj e-shop integrace'"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Slouží jen pro tvoje rozpoznání. Klíč podle něj nelze najít.
            </p>
          </div>

          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fullAccess}
                onChange={(e) => setFullAccess(e.target.checked)}
                className="mt-0.5"
              />
              <div className="text-sm">
                <strong>Full access</strong> — klíč může všechno (čtení i zápis všech entit). Vhodné
                pro vlastní integrace. <em>Doporučeno pro začátek.</em>
              </div>
            </label>
          </div>

          {!fullAccess && (
            <div>
              <label className="block text-sm font-medium mb-2">Vyber scopes</label>
              <div className="grid grid-cols-2 gap-1.5">
                {API_KEY_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-2 py-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <code className="text-xs">{scope}</code>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Vytvářím…' : 'Vytvořit klíč'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Zrušit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
