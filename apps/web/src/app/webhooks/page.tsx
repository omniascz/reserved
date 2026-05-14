'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createWebhook,
  deleteWebhook,
  getAccessToken,
  listWebhookDeliveries,
  listWebhooks,
  testWebhook,
  updateWebhook,
  WEBHOOK_EVENT_TYPES,
  type AdminWebhook,
  type AdminWebhookCreated,
  type AdminWebhookDelivery,
  type WebhookEventType,
} from '@/lib/api';

const EVENT_LABELS: Record<WebhookEventType, string> = {
  'booking.created': 'Nová rezervace',
  'booking.confirmed': 'Potvrzená rezervace',
  'booking.cancelled': 'Zrušená rezervace',
  'booking.completed': 'Dokončená rezervace',
  'booking.no_show': 'Klient nedorazil',
  'customer.created': 'Nový zákazník',
};

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

interface FormState {
  id: string | null;
  name: string;
  url: string;
  eventTypes: WebhookEventType[];
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  url: '',
  eventTypes: ['booking.created'],
  isActive: true,
};

export default function WebhooksPage() {
  const router = useRouter();
  const [webhooks, setWebhooks] = useState<AdminWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [createdSecret, setCreatedSecret] = useState<AdminWebhookCreated | null>(null);
  const [deliveries, setDeliveries] = useState<{
    webhookId: string;
    items: AdminWebhookDelivery[];
  } | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listWebhooks();
      setWebhooks(data);
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

  function startEdit(w: AdminWebhook) {
    setEditing({
      id: w.id,
      name: w.name,
      url: w.url,
      eventTypes: w.eventTypes,
      isActive: w.isActive,
    });
  }

  function toggleEventType(type: WebhookEventType) {
    if (!editing) return;
    const has = editing.eventTypes.includes(type);
    setEditing({
      ...editing,
      eventTypes: has
        ? editing.eventTypes.filter((t) => t !== type)
        : [...editing.eventTypes, type],
    });
  }

  async function handleSave() {
    if (!editing) return;
    if (editing.eventTypes.length === 0) {
      setError('Vyber alespoň jeden typ události.');
      return;
    }
    setError(null);
    try {
      if (editing.id) {
        await updateWebhook(editing.id, {
          name: editing.name,
          url: editing.url,
          eventTypes: editing.eventTypes,
          isActive: editing.isActive,
        });
        setEditing(null);
      } else {
        const created = await createWebhook({
          name: editing.name,
          url: editing.url,
          eventTypes: editing.eventTypes,
        });
        setEditing(null);
        setCreatedSecret(created);
      }
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(w: AdminWebhook) {
    if (!confirm(`Smazat webhook "${w.name}"?`)) return;
    try {
      await deleteWebhook(w.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleTest(w: AdminWebhook) {
    setError(null);
    try {
      const res = await testWebhook(w.id);
      if (res.ok) {
        alert(`Test OK — HTTP ${res.responseStatus}`);
      } else {
        alert(
          `Test selhal — ${res.error ?? `HTTP ${res.responseStatus}`}\n\n${res.responseBody?.slice(0, 200) ?? ''}`,
        );
      }
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleToggleActive(w: AdminWebhook) {
    try {
      await updateWebhook(w.id, { isActive: !w.isActive });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleShowDeliveries(w: AdminWebhook) {
    try {
      const items = await listWebhookDeliveries(w.id);
      setDeliveries({ webhookId: w.id, items });
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
            <h2 className="text-2xl font-bold">Webhooky</h2>
            <p className="text-sm text-slate-500">
              Pošli události (rezervace, zákazníci) do Zapieru, Make/Integromat, IFTTT nebo
              vlastního endpointu. Reserved posílá POST na tvoji URL podepsaný HMAC-SHA256.
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nový webhook
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Modal: Edit / Create */}
        {editing && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">
                {editing.id ? 'Upravit webhook' : 'Nový webhook'}
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Název *</label>
                  <input
                    type="text"
                    required
                    placeholder="např. Zapier — nová rezervace"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">URL endpointu *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://hooks.zapier.com/..."
                    value={editing.url}
                    onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Události *</label>
                  <div className="space-y-1">
                    {WEBHOOK_EVENT_TYPES.map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editing.eventTypes.includes(type)}
                          onChange={() => toggleEventType(type)}
                        />
                        <span className="font-mono text-xs text-slate-500">{type}</span>
                        <span className="text-slate-700">— {EVENT_LABELS[type]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {editing.id && (
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.isActive}
                      onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                    />
                    Aktivní
                  </label>
                )}
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

        {/* Modal: secret po vytvoreni */}
        {createdSecret && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-6">
              <h3 className="text-lg font-bold mb-2">Webhook vytvořen</h3>
              <p className="text-sm text-slate-700 mb-2">
                <strong>Zkopíruj si tento secret hned!</strong> Slouží k ověření, že příchozí POST
                request je opravdu od Reserved (HMAC-SHA256). Po zavření tohoto okna ho už neuvidíš.
              </p>
              <pre className="bg-slate-100 border border-slate-300 rounded p-3 text-xs font-mono overflow-x-auto">
                {createdSecret.secret}
              </pre>
              <p className="text-xs text-slate-500 mt-3">
                Reserved bude posílat hlavičku{' '}
                <code className="text-slate-700">X-Reserved-Signature: sha256=&lt;hex&gt;</code> kde
                hex = HMAC(secret, body). Verifikuj na své straně.
              </p>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdSecret.secret);
                    alert('Zkopírováno do schránky.');
                  }}
                  className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
                >
                  Zkopírovat
                </button>
                <button
                  onClick={() => setCreatedSecret(null)}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  Mám zkopírováno
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: deliveries */}
        {deliveries && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold">Posledních 50 doručení</h3>
                <button
                  onClick={() => setDeliveries(null)}
                  className="text-slate-400 hover:text-slate-700 text-2xl"
                >
                  ×
                </button>
              </div>
              {deliveries.items.length === 0 ? (
                <p className="text-sm text-slate-500">Žádná doručení zatím.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-2 py-2">Čas</th>
                      <th className="px-2 py-2">Event</th>
                      <th className="px-2 py-2">Stav</th>
                      <th className="px-2 py-2">HTTP</th>
                      <th className="px-2 py-2">Chyba</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.items.map((d) => (
                      <tr key={d.id} className="border-t border-slate-100">
                        <td className="px-2 py-2 text-slate-500">{formatDate(d.createdAt)}</td>
                        <td className="px-2 py-2 font-mono">{d.eventType}</td>
                        <td className="px-2 py-2">
                          {d.status === 'sent' ? (
                            <span className="text-emerald-700">✓ doručeno</span>
                          ) : d.status === 'failed' ? (
                            <span className="text-red-700">✗ chyba</span>
                          ) : (
                            <span className="text-slate-500">čeká</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-600">{d.responseStatus ?? '—'}</td>
                        <td
                          className="px-2 py-2 text-red-600 max-w-xs truncate"
                          title={d.lastError ?? ''}
                        >
                          {d.lastError ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-4">
          {!loading && webhooks.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              Žádné webhooky zatím. Vytvoř první (např. propojení se Zapierem).
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Název</th>
                  <th className="text-left px-4 py-3 font-semibold">URL</th>
                  <th className="text-left px-4 py-3 font-semibold">Události</th>
                  <th className="text-center px-4 py-3 font-semibold">Stav</th>
                  <th className="w-64"></th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">{w.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 truncate max-w-xs">
                      {w.url}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{w.eventTypes.join(', ')}</td>
                    <td className="text-center px-4 py-3 text-xs">
                      {w.isActive ? (
                        <span className="text-emerald-700">✓ aktivní</span>
                      ) : (
                        <span className="text-slate-500">vypnut</span>
                      )}
                      {w.consecutiveErrors > 0 && (
                        <div className="text-red-600 mt-1">
                          {w.consecutiveErrors} chyb v řadě
                          {w.consecutiveErrors >= 5 && ' (pozastaveno)'}
                        </div>
                      )}
                      <div className="text-slate-400 mt-1">✓ {formatDate(w.lastSuccessAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleTest(w)}
                        className="text-brand-600 hover:underline text-sm mr-3"
                      >
                        Test
                      </button>
                      <button
                        onClick={() => handleShowDeliveries(w)}
                        className="text-slate-600 hover:underline text-sm mr-3"
                      >
                        Log
                      </button>
                      <button
                        onClick={() => handleToggleActive(w)}
                        className="text-slate-600 hover:underline text-sm mr-3"
                      >
                        {w.isActive ? 'Vypnout' : 'Zapnout'}
                      </button>
                      <button
                        onClick={() => startEdit(w)}
                        className="text-brand-600 hover:underline text-sm mr-3"
                      >
                        Upravit
                      </button>
                      <button
                        onClick={() => handleDelete(w)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Smazat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <section className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
          <h3 className="font-semibold text-slate-900 mb-2">Formát payloadu</h3>
          <pre className="bg-white border border-slate-200 rounded p-3 font-mono text-[11px] overflow-x-auto">
            {`POST <your-url>
Content-Type: application/json
X-Reserved-Signature: sha256=<hmac-hex>
X-Reserved-Event-Type: booking.created
X-Reserved-Webhook-Id: <uuid>
X-Reserved-Delivery-Id: <uuid>

{
  "eventType": "booking.created",
  "tenantId": "<uuid>",
  "payload": { /* event-specific data */ },
  "timestamp": "2026-05-14T10:00:00Z"
}`}
          </pre>
          <p className="text-slate-600 mt-2">
            <strong>Verifikace podpisu:</strong> spočti HMAC-SHA256(secret, raw_body) a porovnej s
            hodnotou v <code>X-Reserved-Signature</code> (formát <code>sha256=&lt;hex&gt;</code>).
          </p>
        </section>
      </main>
    </div>
  );
}
