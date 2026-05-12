'use client';

import { useState } from 'react';

export interface RuleFormState {
  id: string | null;
  name: string;
  description: string;
  triggerEvent: string;
  condition: ComparisonNode | AlwaysNode;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  isEnabled: boolean;
  priority: number;
}

type AlwaysNode = { type: 'always' };
type ComparisonNode = {
  type: 'comparison';
  field: string;
  op: string;
  value: unknown;
};

const TRIGGERS = [
  { value: 'booking_cancelled', label: 'Zákazník zrušil rezervaci' },
  { value: 'booking_rescheduled', label: 'Zákazník přesunul rezervaci' },
  { value: 'booking_created', label: 'Vytvořena nová rezervace' },
  { value: 'booking_completed', label: 'Rezervace dokončena' },
  { value: 'booking_no_show', label: 'Klient nedorazil (no-show)' },
  { value: 'customer_registered', label: 'Nový zákazník se zaregistroval' },
];

const CONDITION_FIELDS = [
  { value: 'hoursUntilStart', label: 'Hodin do začátku', kind: 'number' },
  { value: 'pricePaidHellers', label: 'Cena rezervace (v haléřích)', kind: 'number' },
  { value: 'status', label: 'Stav rezervace', kind: 'string' },
  { value: 'serviceId', label: 'ID služby', kind: 'string' },
  { value: 'employeeId', label: 'ID zaměstnance', kind: 'string' },
  { value: 'branchId', label: 'ID pobočky', kind: 'string' },
  { value: 'triggeredBy', label: 'Spustil', kind: 'string' },
];

const OPERATORS = [
  { value: 'eq', label: 'rovná se' },
  { value: 'ne', label: 'nerovná se' },
  { value: 'lt', label: 'menší než' },
  { value: 'lte', label: 'menší nebo rovno' },
  { value: 'gt', label: 'větší než' },
  { value: 'gte', label: 'větší nebo rovno' },
  { value: 'in', label: 'je jedno z (oddělené čárkou)' },
  { value: 'contains', label: 'obsahuje text' },
];

const ACTION_TYPES = [
  { value: 'log_message', label: 'Logovat zprávu (pro testování)' },
  { value: 'send_email', label: 'Poslat e-mail' },
  { value: 'add_customer_tag', label: 'Přidat zákazníkovi tag' },
  { value: 'charge_storno_fee', label: 'Strhnout storno poplatek (% z ceny)' },
  { value: 'webhook', label: 'Zavolat webhook (HTTP POST na URL)' },
];

export function RuleEditor({
  form,
  onSave,
  onCancel,
}: {
  form: RuleFormState;
  onSave: (form: RuleFormState) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<RuleFormState>(form);
  const [saving, setSaving] = useState(false);

  function update(patch: Partial<RuleFormState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  function updateCondition(patch: Partial<ComparisonNode>) {
    if (state.condition.type === 'comparison') {
      update({ condition: { ...state.condition, ...patch } });
    }
  }

  function toggleCondition() {
    if (state.condition.type === 'always') {
      update({
        condition: { type: 'comparison', field: 'hoursUntilStart', op: 'lt', value: '12' },
      });
    } else {
      update({ condition: { type: 'always' } });
    }
  }

  function addAction() {
    update({
      actions: [...state.actions, { type: 'log_message', config: { message: '' } }],
    });
  }

  function removeAction(idx: number) {
    update({ actions: state.actions.filter((_, i) => i !== idx) });
  }

  function updateAction(idx: number, type: string) {
    const defaultConfig = getDefaultConfig(type);
    const newActions = [...state.actions];
    newActions[idx] = { type, config: defaultConfig };
    update({ actions: newActions });
  }

  function updateActionConfig(idx: number, configPatch: Record<string, unknown>) {
    const newActions = [...state.actions];
    const current = newActions[idx];
    if (current) {
      newActions[idx] = { ...current, config: { ...current.config, ...configPatch } };
      update({ actions: newActions });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(state);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5"
    >
      <h3 className="font-semibold text-lg">{state.id ? 'Upravit pravidlo' : 'Nové pravidlo'}</h3>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Název *</label>
          <input
            type="text"
            value={state.name}
            onChange={(e) => update({ name: e.target.value })}
            required
            placeholder="Pozdní storno = poplatek"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Priorita (vyšší = dřív)</label>
          <input
            type="number"
            value={state.priority}
            onChange={(e) => update({ priority: Number(e.target.value) || 100 })}
            min={0}
            max={1000}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Popis (pro tebe)</label>
          <input
            type="text"
            value={state.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Pro lepší orientaci, co toto pravidlo dělá"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      {/* Krok 1: KDY */}
      <Section title="① KDY se má pravidlo spustit?" hint="Vyber událost.">
        <select
          value={state.triggerEvent}
          onChange={(e) => update({ triggerEvent: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        >
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Section>

      {/* Krok 2: JESTLI */}
      <Section
        title="② JESTLI platí podmínka"
        hint="Třeba: pokud klient zruší méně než 12h před termínem."
      >
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={state.condition.type === 'comparison'}
            onChange={toggleCondition}
          />
          <span className="text-sm">Přidat podmínku (jinak vždy spustit)</span>
        </label>

        {state.condition.type === 'comparison' && (
          <div className="grid grid-cols-12 gap-2 items-center">
            <select
              value={state.condition.field}
              onChange={(e) => updateCondition({ field: e.target.value })}
              className="col-span-4 px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {CONDITION_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={state.condition.op}
              onChange={(e) => updateCondition({ op: e.target.value })}
              className="col-span-4 px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={String(state.condition.value ?? '')}
              onChange={(e) => updateCondition({ value: e.target.value })}
              className="col-span-4 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="hodnota"
            />
          </div>
        )}
      </Section>

      {/* Krok 3: PAK */}
      <Section title="③ POTOM udělej" hint="Akce se provedou v pořadí. Můžeš jich přidat víc.">
        <div className="space-y-3">
          {state.actions.map((a, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={a.type}
                  onChange={(e) => updateAction(idx, e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  {ACTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {state.actions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAction(idx)}
                    className="text-red-600 hover:text-red-800"
                    aria-label="Odstranit akci"
                  >
                    ×
                  </button>
                )}
              </div>
              <ActionConfig action={a} onChange={(patch) => updateActionConfig(idx, patch)} />
            </div>
          ))}
          <button
            type="button"
            onClick={addAction}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            + Přidat další akci
          </button>
        </div>
      </Section>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={state.isEnabled}
          onChange={(e) => update({ isEnabled: e.target.checked })}
        />
        <span className="text-sm">Pravidlo aktivní (jinak se nespustí)</span>
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-medium"
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
        >
          {saving ? 'Ukládám…' : state.id ? 'Uložit změny' : 'Vytvořit pravidlo'}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="font-semibold text-sm mb-1">{title}</h4>
      {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function ActionConfig({
  action,
  onChange,
}: {
  action: { type: string; config: Record<string, unknown> };
  onChange: (patch: Record<string, unknown>) => void;
}) {
  switch (action.type) {
    case 'log_message':
      return (
        <input
          type="text"
          value={String(action.config.message ?? '')}
          onChange={(e) => onChange({ message: e.target.value })}
          placeholder="Text zprávy do logu"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      );
    case 'send_email':
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={String(action.config.subject ?? '')}
            onChange={(e) => onChange({ subject: e.target.value })}
            placeholder="Předmět e-mailu"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <textarea
            value={String(action.config.body ?? '')}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={3}
            placeholder="Obsah e-mailu (můžeš použít {{customerName}}, {{referenceCode}}, …)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <input
            type="text"
            value={String(action.config.to ?? '')}
            onChange={(e) => onChange({ to: e.target.value })}
            placeholder="Komu (prázdné = zákazník z rezervace)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      );
    case 'add_customer_tag':
      return (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={String(action.config.tag ?? '')}
            onChange={(e) => onChange({ tag: e.target.value })}
            placeholder="Název tagu (např. pozdní storno)"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <input
            type="color"
            value={String(action.config.color ?? '#ef4444')}
            onChange={(e) => onChange({ color: e.target.value })}
            className="w-full h-10 border border-slate-300 rounded-lg"
          />
        </div>
      );
    case 'charge_storno_fee':
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={Number(action.config.percent ?? 50)}
            onChange={(e) => onChange({ percent: Number(e.target.value) })}
            min={0}
            max={100}
            className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <span className="text-sm text-slate-500">% z ceny rezervace</span>
        </div>
      );
    case 'webhook':
      return (
        <input
          type="url"
          value={String(action.config.url ?? '')}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://example.com/webhook"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      );
    default:
      return null;
  }
}

function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case 'log_message':
      return { message: '' };
    case 'send_email':
      return { subject: '', body: '', to: '' };
    case 'add_customer_tag':
      return { tag: '', color: '#ef4444' };
    case 'charge_storno_fee':
      return { percent: 50 };
    case 'webhook':
      return { url: '' };
    default:
      return {};
  }
}
