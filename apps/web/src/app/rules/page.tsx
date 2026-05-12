'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createRule,
  deleteRule,
  getAccessToken,
  listRules,
  updateRule,
  type AdminRule,
} from '@/lib/api';
import { RuleEditor, type RuleFormState } from './RuleEditor';
import { RuleExecutions } from './RuleExecutions';

const TRIGGER_LABELS: Record<string, string> = {
  booking_created: 'Vytvořena nová rezervace',
  booking_cancelled: 'Zrušena rezervace',
  booking_rescheduled: 'Přesunuta rezervace',
  booking_completed: 'Dokončena rezervace',
  booking_no_show: 'Klient nedorazil',
  customer_registered: 'Registrace nového zákazníka',
};

export default function RulesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<AdminRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RuleFormState | null>(null);
  const [viewingExecutions, setViewingExecutions] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await listRules());
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
    setEditing({
      id: null,
      name: '',
      description: '',
      triggerEvent: 'booking_cancelled',
      condition: {
        type: 'comparison',
        field: 'hoursUntilStart',
        op: 'lt',
        value: '12',
      },
      actions: [{ type: 'log_message', config: { message: 'Pozdní storno detekováno' } }],
      isEnabled: true,
      priority: 100,
    });
  }

  function startEdit(r: AdminRule) {
    setEditing({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      triggerEvent: r.triggerEvent,
      condition: r.conditions as RuleFormState['condition'],
      actions: r.actions,
      isEnabled: r.isEnabled,
      priority: r.priority,
    });
  }

  async function handleSave(form: RuleFormState) {
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        triggerEvent: form.triggerEvent,
        conditions: form.condition,
        actions: form.actions,
        isEnabled: form.isEnabled,
        priority: form.priority,
      };
      if (form.id) {
        await updateRule(form.id, payload);
      } else {
        await createRule(payload);
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(r: AdminRule) {
    if (!confirm(`Smazat pravidlo "${r.name}"?`)) return;
    try {
      await deleteRule(r.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleToggle(r: AdminRule) {
    try {
      await updateRule(r.id, { isEnabled: !r.isEnabled });
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
            <h2 className="text-2xl font-bold">Pravidla automatizace</h2>
            <p className="text-sm text-slate-500">
              KDY se něco stane (událost) + JESTLI platí podmínka → udělej akci. Třeba: „když
              zákazník zruší méně než 12h před termínem → přidej mu tag ‚pozdní storno' a strhni 50%
              poplatek".
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nové pravidlo
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {editing && (
          <RuleEditor form={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
        )}

        {viewingExecutions && (
          <RuleExecutions ruleId={viewingExecutions} onClose={() => setViewingExecutions(null)} />
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold w-12">Stav</th>
                <th className="text-left px-4 py-3 font-semibold">Název</th>
                <th className="text-left px-4 py-3 font-semibold">Spouští se</th>
                <th className="text-center px-4 py-3 font-semibold">Akce</th>
                <th className="text-right px-4 py-3 font-semibold">Trigerováno</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && rules.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Žádná pravidla. Začni vytvořením prvního — třeba „pozdní storno = strhni
                    poplatek".
                  </td>
                </tr>
              )}
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(r)}
                      className={`w-10 h-6 rounded-full relative transition ${
                        r.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      title={r.isEnabled ? 'Aktivní' : 'Vypnuté'}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
                          r.isEnabled ? 'left-4' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    {r.description && (
                      <div className="text-xs text-slate-500 mt-0.5">{r.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {TRIGGER_LABELS[r.triggerEvent] ?? r.triggerEvent}
                  </td>
                  <td className="px-4 py-3 text-center">{r.actions.length}</td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {r.triggerCount}×
                    {r.lastTriggeredAt && (
                      <div className="text-xs">
                        naposled {new Date(r.lastTriggeredAt).toLocaleString('cs-CZ')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setViewingExecutions(r.id)}
                      className="text-slate-500 hover:text-slate-800 text-sm mr-3"
                      title="Zobrazit historii spuštění"
                    >
                      Historie
                    </button>
                    <button
                      onClick={() => startEdit(r)}
                      className="text-brand-600 hover:text-brand-800 text-sm mr-3"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-red-600 hover:text-red-800"
                      aria-label="Smazat"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
