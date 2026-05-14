'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  deleteFeatureFlag,
  getAccessToken,
  listFeatureFlags,
  toggleFeatureFlag,
  upsertFeatureFlag,
  type AdminFeatureFlag,
} from '@/lib/api';

interface FormState {
  key: string;
  description: string;
  isEnabled: boolean;
  configJson: string;
}

const EMPTY_FORM: FormState = {
  key: '',
  description: '',
  isEnabled: false,
  configJson: '{}',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FeatureFlagsPage() {
  const router = useRouter();
  const [flags, setFlags] = useState<AdminFeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listFeatureFlags();
      setFlags(data);
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

  function startNew() {
    setEditing({ ...EMPTY_FORM });
  }

  function startEdit(f: AdminFeatureFlag) {
    setEditing({
      key: f.key,
      description: f.description ?? '',
      isEnabled: f.isEnabled,
      configJson: JSON.stringify(f.config, null, 2),
    });
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(editing.configJson);
      if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        throw new Error('Config musí být JSON objekt {}.');
      }
    } catch (e) {
      setError(`Neplatný JSON: ${e instanceof Error ? e.message : 'chyba'}`);
      return;
    }
    try {
      await upsertFeatureFlag({
        key: editing.key,
        description: editing.description || null,
        isEnabled: editing.isEnabled,
        config,
      });
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleToggle(f: AdminFeatureFlag) {
    try {
      await toggleFeatureFlag(f.key, !f.isEnabled);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(f: AdminFeatureFlag) {
    if (!confirm(`Smazat flag "${f.key}"? Akce je nevratná.`)) return;
    try {
      await deleteFeatureFlag(f.key);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Feature flags</h2>
            <p className="text-sm text-slate-500">
              Zapínání/vypínání funkcí. Konvence:{' '}
              <code className="text-xs">lowercase_underscore</code> + dvojtečka pro namespacing
              (např. <code className="text-xs">beta:google_sync</code>).
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nový flag
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {editing && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Feature flag</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Klíč *</label>
                  <input
                    type="text"
                    required
                    placeholder="beta:google_sync"
                    value={editing.key}
                    onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    lowercase + underscore. Dvojtečka pro namespace (např. beta:, integrations:).
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Popis</label>
                  <textarea
                    rows={2}
                    placeholder="K čemu flag slouží, kdo ho má používat..."
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Config (JSON) — pro typed config
                  </label>
                  <textarea
                    rows={4}
                    value={editing.configJson}
                    onChange={(e) => setEditing({ ...editing, configJson: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 font-mono text-xs"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Příklad: <code>{'{"percentageRollout": 50}'}</code> nebo{' '}
                    <code>{'{"requiredTags": ["VIP"]}'}</code>
                  </p>
                </div>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.isEnabled}
                    onChange={(e) => setEditing({ ...editing, isEnabled: e.target.checked })}
                  />
                  <span className="text-sm font-medium">Zapnuto</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  Uložit
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Klíč</th>
                <th className="text-left px-4 py-3 font-semibold">Popis</th>
                <th className="text-center px-4 py-3 font-semibold">Config</th>
                <th className="text-center px-4 py-3 font-semibold">Stav</th>
                <th className="text-left px-4 py-3 font-semibold">Změněno</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && flags.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Žádné feature flags. Vytvoř první.
                  </td>
                </tr>
              )}
              {flags.map((f) => {
                const hasConfig = Object.keys(f.config).length > 0;
                return (
                  <tr key={f.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{f.key}</code>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{f.description ?? '—'}</td>
                    <td className="text-center px-4 py-3">
                      {hasConfig ? (
                        <details className="text-left inline-block">
                          <summary className="text-xs text-brand-600 cursor-pointer">
                            {Object.keys(f.config).length} klíčů
                          </summary>
                          <pre className="text-xs bg-slate-50 p-2 rounded mt-1 max-w-xs overflow-auto">
                            {JSON.stringify(f.config, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-center px-4 py-3">
                      <button
                        onClick={() => handleToggle(f)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          f.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            f.isEnabled ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(f.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(f)}
                        className="text-brand-600 hover:underline text-sm mr-3"
                      >
                        Upravit
                      </button>
                      <button
                        onClick={() => handleDelete(f)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Smazat
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
