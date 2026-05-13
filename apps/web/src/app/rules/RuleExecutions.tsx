'use client';

import { useEffect, useState } from 'react';
import { listRuleExecutions, type AdminRuleExecution } from '@/lib/api';

export function RuleExecutions({ ruleId, onClose }: { ruleId: string; onClose: () => void }) {
  const [executions, setExecutions] = useState<AdminRuleExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRuleExecutions(ruleId, 50)
      .then(setExecutions)
      .catch((e) => setError(e?.message ?? 'Chyba'))
      .finally(() => setLoading(false));
  }, [ruleId]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 my-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold">Historie spuštění pravidla</h2>
            <p className="text-sm text-slate-500">
              Posledních {executions.length} spuštění. Tady uvidíš, kdy se pravidlo vyhodnotilo a co
              z toho vzniklo.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl">
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-slate-400 py-8 text-center">Načítám…</div>
        ) : executions.length === 0 ? (
          <div className="text-slate-500 py-8 text-center">Pravidlo se zatím nikdy nespustilo.</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {executions.map((e) => (
              <ExecutionRow key={e.id} execution={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExecutionRow({ execution }: { execution: AdminRuleExecution }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-2 h-2 rounded-full ${
              execution.matched ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          />
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {new Date(execution.createdAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}
          </span>
          <span className="text-sm font-medium truncate">{execution.eventType}</span>
          {execution.matched ? (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              MATCH ({execution.actionResults.length} akcí)
            </span>
          ) : (
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              neshodly podmínky
            </span>
          )}
        </div>
        <span className="text-slate-400">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-3 bg-slate-50 space-y-3 text-xs">
          <div>
            <div className="font-semibold mb-1">Payload</div>
            <pre className="bg-white p-2 rounded border border-slate-200 overflow-auto max-h-32">
              {JSON.stringify(execution.eventPayload, null, 2)}
            </pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Výsledky akcí</div>
            {execution.actionResults.length === 0 ? (
              <div className="text-slate-500">(žádné akce)</div>
            ) : (
              <div className="space-y-1">
                {execution.actionResults.map((r, i) => (
                  <div
                    key={i}
                    className={`px-2 py-1 rounded ${
                      r.status === 'ok'
                        ? 'bg-emerald-100 text-emerald-800'
                        : r.status === 'skipped'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    <span className="font-mono">{r.action}</span> — {r.status}
                    {r.message && <span className="text-slate-600"> ({r.message})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {execution.error && (
            <div>
              <div className="font-semibold mb-1 text-red-700">Chyba</div>
              <pre className="bg-red-50 text-red-800 p-2 rounded border border-red-200">
                {execution.error}
              </pre>
            </div>
          )}
          {execution.durationMs !== null && (
            <div className="text-slate-500">Trvání: {execution.durationMs} ms</div>
          )}
        </div>
      )}
    </div>
  );
}
