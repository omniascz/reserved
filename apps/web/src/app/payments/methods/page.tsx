'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  deletePaymentMethod,
  getAccessToken,
  listPaymentMethods,
  upsertPaymentMethod,
  type AdminPaymentMethod,
  type PaymentMethodType,
} from '@/lib/api';

interface MethodTemplate {
  type: PaymentMethodType;
  label: string;
  description: string;
  icon: string;
  phase: 'A' | 'B';
  configFields?: Array<{ key: string; label: string; placeholder?: string; type?: string }>;
}

const TEMPLATES: MethodTemplate[] = [
  {
    type: 'cash',
    label: 'Hotovost',
    description: 'Klient platí na recepci v hotovosti. Bez nákladů.',
    icon: '💵',
    phase: 'A',
  },
  {
    type: 'card_terminal',
    label: 'Karta na terminálu',
    description: 'Klient platí kartou přes platební terminál. Manuální záznam.',
    icon: '💳',
    phase: 'A',
  },
  {
    type: 'qr_bank',
    label: 'QR platba (bank převod)',
    description:
      'Vygenerujeme QR kód s tvým IBAN. Klient platí mobilní bankou. Po dorazení převodu označíš ručně.',
    icon: '📱',
    phase: 'A',
    configFields: [
      {
        key: 'iban',
        label: 'IBAN účtu',
        placeholder: 'CZ58 0800 0000 0000 0000 0000',
      },
      { key: 'accountName', label: 'Název majitele účtu (volitelně)' },
    ],
  },
  {
    type: 'stripe',
    label: 'Stripe (karta online)',
    description: 'Globální platební brána. Klient platí kartou online. Bude k dispozici ve Fázi B.',
    icon: '🌐',
    phase: 'B',
    configFields: [
      { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_test_...' },
      { key: 'secretKey', label: 'Secret Key', placeholder: 'sk_test_...', type: 'password' },
      { key: 'webhookSecret', label: 'Webhook Secret', placeholder: 'whsec_...', type: 'password' },
    ],
  },
  {
    type: 'gopay',
    label: 'GoPay (česká brána)',
    description: 'Česká platební brána. Karta + bankovní převody + Apple Pay. Bude ve Fázi B.',
    icon: '🌐',
    phase: 'B',
    configFields: [
      { key: 'goId', label: 'GoID' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' },
    ],
  },
];

export default function PaymentMethodsPage() {
  const router = useRouter();
  const [methods, setMethods] = useState<AdminPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<PaymentMethodType | null>(null);
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [editEnabled, setEditEnabled] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setMethods(await listPaymentMethods());
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

  function findMethod(type: PaymentMethodType): AdminPaymentMethod | undefined {
    return methods.find((m) => m.methodType === type);
  }

  function startEdit(template: MethodTemplate) {
    const existing = findMethod(template.type);
    const initialConfig: Record<string, string> = {};
    if (template.configFields) {
      for (const field of template.configFields) {
        initialConfig[field.key] = String(
          (existing?.config as Record<string, unknown> | undefined)?.[field.key] ?? '',
        );
      }
    }
    setEditingType(template.type);
    setEditConfig(initialConfig);
    setEditEnabled(existing?.isEnabled ?? true);
  }

  async function handleSave() {
    if (!editingType) return;
    try {
      await upsertPaymentMethod({
        methodType: editingType,
        config: editConfig,
        isEnabled: editEnabled,
      });
      setEditingType(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleToggle(template: MethodTemplate) {
    const existing = findMethod(template.type);
    try {
      await upsertPaymentMethod({
        methodType: template.type,
        config: (existing?.config as Record<string, unknown> | undefined) ?? {},
        isEnabled: !(existing?.isEnabled ?? false),
      });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(template: MethodTemplate) {
    if (!confirm(`Odebrat ${template.label}?`)) return;
    try {
      await deletePaymentMethod(template.type);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Platební metody</h2>
            <p className="text-sm text-slate-500">
              Vyber, které způsoby plateb tvůj salon akceptuje.
            </p>
          </div>
          <Link
            href="/payments"
            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            ← Zpět na platby
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {TEMPLATES.map((tpl) => {
            const existing = findMethod(tpl.type);
            const enabled = existing?.isEnabled ?? false;
            return (
              <div
                key={tpl.type}
                className={`bg-white rounded-xl border ${
                  enabled ? 'border-emerald-300' : 'border-slate-200'
                } p-4`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl">{tpl.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{tpl.label}</h3>
                      {enabled && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                          Aktivní
                        </span>
                      )}
                      {tpl.phase === 'B' && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          Fáze B (později)
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{tpl.description}</p>

                    {editingType === tpl.type && tpl.configFields && (
                      <div className="mt-3 space-y-2 bg-slate-50 p-3 rounded-lg">
                        {tpl.configFields.map((field) => (
                          <div key={field.key}>
                            <label className="block text-xs font-medium mb-1">{field.label}</label>
                            <input
                              type={field.type ?? 'text'}
                              value={editConfig[field.key] ?? ''}
                              onChange={(e) =>
                                setEditConfig({ ...editConfig, [field.key]: e.target.value })
                              }
                              placeholder={field.placeholder}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
                            />
                          </div>
                        ))}
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editEnabled}
                            onChange={(e) => setEditEnabled(e.target.checked)}
                          />
                          Zapnout tuto metodu
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setEditingType(null)}
                            className="text-sm bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded"
                          >
                            Zrušit
                          </button>
                          <button
                            onClick={handleSave}
                            className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded font-medium"
                          >
                            Uložit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {editingType !== tpl.type && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {tpl.configFields && tpl.configFields.length > 0 ? (
                        <button
                          onClick={() => startEdit(tpl)}
                          className="text-sm bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded"
                        >
                          {existing ? 'Upravit' : 'Nastavit'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggle(tpl)}
                          className={`text-sm px-3 py-1.5 rounded font-medium ${
                            enabled
                              ? 'bg-red-100 hover:bg-red-200 text-red-700'
                              : 'bg-brand-600 hover:bg-brand-700 text-white'
                          }`}
                        >
                          {enabled ? 'Vypnout' : 'Zapnout'}
                        </button>
                      )}
                      {existing && (
                        <button
                          onClick={() => handleDelete(tpl)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Odebrat
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
