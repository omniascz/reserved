'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ActionType, ComparisonNode, Operator } from '@reserved/rules-engine';
import type { RuleFormState } from './RuleEditor';

// Vizualni builder s plnym edit modem:
// - Klik na uzel otevře side panel s editorem
// - Tlacitka pro pridat/odebrat action
// - Save z vizualu = stejny onSave callback jako klasicky editor
// - State sdileny pres props (onChange + form)

const TRIGGER_LABELS: Record<string, string> = {
  booking_created: 'Vytvořena rezervace',
  booking_cancelled: 'Zrušena rezervace',
  booking_rescheduled: 'Přesunuta rezervace',
  booking_completed: 'Dokončena rezervace',
  booking_no_show: 'Klient nedorazil',
  customer_registered: 'Nová registrace',
};

const TRIGGER_OPTIONS = Object.entries(TRIGGER_LABELS);

const ACTION_LABELS: Record<string, string> = {
  send_email: '📧 Poslat e-mail',
  add_customer_tag: '🏷️ Přidat tag',
  charge_storno_fee: '💰 Storno poplatek',
  deduct_credit_pack: '🎫 Strhnout kredit',
  webhook: '🔗 Webhook',
  log_message: '📝 Log zpráva',
  remove_customer_tag: '🗑️ Odebrat tag',
};

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'log_message', label: '📝 Log zpráva (pro testování)' },
  { value: 'send_email', label: '📧 Poslat e-mail' },
  { value: 'add_customer_tag', label: '🏷️ Přidat tag zákazníkovi' },
  { value: 'charge_storno_fee', label: '💰 Storno poplatek (%)' },
  { value: 'deduct_credit_pack', label: '🎫 Strhnout kredit' },
  { value: 'webhook', label: '🔗 Webhook' },
];

const FIELD_LABELS: Record<string, string> = {
  hoursUntilStart: 'Hodin do začátku',
  pricePaidHellers: 'Cena (haléře)',
  status: 'Stav',
  serviceId: 'ID služby',
  employeeId: 'ID zaměstnance',
  branchId: 'ID pobočky',
  triggeredBy: 'Spustil',
};

const FIELD_OPTIONS = Object.entries(FIELD_LABELS);

const OP_LABELS: Record<string, string> = {
  eq: '=',
  ne: '≠',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  in: 'je z',
  contains: 'obsahuje',
};

const OP_OPTIONS: { value: Operator; label: string }[] = [
  { value: 'eq', label: 'rovná se' },
  { value: 'ne', label: 'nerovná se' },
  { value: 'lt', label: 'menší než' },
  { value: 'lte', label: 'menší nebo rovno' },
  { value: 'gt', label: 'větší než' },
  { value: 'gte', label: 'větší nebo rovno' },
  { value: 'in', label: 'je jedno z' },
  { value: 'contains', label: 'obsahuje text' },
];

// ─── Node data types ────────────────────────────────────────────────

type TriggerNodeData = { triggerEvent: string };
type ConditionNodeData = {
  mode: 'always' | 'single' | 'and' | 'or';
  conditions: ComparisonNode[];
};
type ActionNodeData = {
  type: string;
  config: Record<string, unknown>;
  index: number;
};

// ─── Node components ────────────────────────────────────────────────

function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerNodeData;
  return (
    <div
      className={`bg-orange-50 border-2 rounded-lg px-4 py-3 min-w-[200px] cursor-pointer ${
        selected ? 'border-orange-600 shadow-md' : 'border-orange-400'
      }`}
    >
      <div className="text-xs font-semibold text-orange-700 uppercase mb-1">① KDY</div>
      <div className="text-sm font-medium">{TRIGGER_LABELS[d.triggerEvent] ?? d.triggerEvent}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConditionGroupNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConditionNodeData;
  return (
    <div
      className={`bg-blue-50 border-2 rounded-lg px-4 py-3 min-w-[240px] cursor-pointer ${
        selected ? 'border-blue-600 shadow-md' : 'border-blue-400'
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="text-xs font-semibold text-blue-700 uppercase mb-1">② JESTLI</div>
      {d.mode === 'always' ? (
        <div className="text-sm italic text-slate-500">vždy spustit</div>
      ) : (
        <div className="text-sm space-y-1">
          {d.conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-1 text-xs">
              {i > 0 && (
                <span className="text-blue-600 font-semibold mr-1">
                  {d.mode === 'and' ? 'A ZÁROVEŇ' : 'NEBO'}
                </span>
              )}
              <span className="font-medium">{FIELD_LABELS[c.field] ?? c.field}</span>
              <span className="text-slate-500">{OP_LABELS[c.op] ?? c.op}</span>
              <span className="font-mono">{String(c.value)}</span>
            </div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ActionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionNodeData;
  const label = ACTION_LABELS[d.type] ?? d.type;
  let summary = '';
  if (d.type === 'log_message') summary = String(d.config.message ?? '');
  else if (d.type === 'send_email') summary = String(d.config.subject ?? '');
  else if (d.type === 'add_customer_tag') summary = String(d.config.tag ?? '');
  else if (d.type === 'charge_storno_fee') summary = `${d.config.percent ?? 0}%`;
  else if (d.type === 'deduct_credit_pack') summary = `${d.config.credits ?? 1} kreditů`;
  else if (d.type === 'webhook') summary = String(d.config.url ?? '');

  return (
    <div
      className={`bg-emerald-50 border-2 rounded-lg px-4 py-3 min-w-[200px] cursor-pointer ${
        selected ? 'border-emerald-600 shadow-md' : 'border-emerald-400'
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="text-xs font-semibold text-emerald-700 uppercase mb-1">
        ③ AKCE {d.index + 1}
      </div>
      <div className="text-sm font-medium">{label}</div>
      {summary && (
        <div className="text-xs text-slate-600 mt-1 truncate max-w-[180px]">{summary}</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const NODE_TYPES = {
  trigger: TriggerNode,
  condition: ConditionGroupNode,
  action: ActionNode,
};

// ─── Graph builder ──────────────────────────────────────────────────

function ruleToGraph(rule: RuleFormState): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: 'trigger',
    type: 'trigger',
    position: { x: 0, y: 80 },
    data: { triggerEvent: rule.triggerEvent } as unknown as Record<string, unknown>,
  });

  const cond = rule.condition;
  const conditionData: ConditionNodeData =
    cond.type === 'always'
      ? { mode: 'always', conditions: [] }
      : cond.type === 'comparison'
        ? { mode: 'single', conditions: [cond] }
        : {
            mode: cond.type,
            conditions: cond.children as ComparisonNode[],
          };

  nodes.push({
    id: 'condition',
    type: 'condition',
    position: { x: 280, y: 80 },
    data: conditionData as unknown as Record<string, unknown>,
  });
  edges.push({ id: 'trigger->condition', source: 'trigger', target: 'condition' });

  let prevId = 'condition';
  rule.actions.forEach((action, idx) => {
    const id = `action-${idx}`;
    nodes.push({
      id,
      type: 'action',
      position: { x: 580, y: idx * 110 },
      data: { type: action.type, config: action.config, index: idx } as unknown as Record<
        string,
        unknown
      >,
    });
    edges.push({ id: `${prevId}->${id}`, source: prevId, target: id });
    prevId = id;
  });

  return { nodes, edges };
}

// ─── Side panel editors ─────────────────────────────────────────────

function TriggerEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-700">Událost</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      >
        {TRIGGER_OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function ConditionEditor({
  value,
  onChange,
}: {
  value: RuleFormState['condition'];
  onChange: (v: RuleFormState['condition']) => void;
}) {
  const currentMode: 'always' | 'single' | 'and' | 'or' =
    value.type === 'always' ? 'always' : value.type === 'comparison' ? 'single' : value.type;

  function changeMode(mode: 'always' | 'single' | 'and' | 'or') {
    const def: ComparisonNode = {
      type: 'comparison',
      field: 'hoursUntilStart',
      op: 'lt',
      value: '12',
    };
    if (mode === 'always') onChange({ type: 'always' });
    else if (mode === 'single') onChange(def);
    else {
      const existing: ComparisonNode[] =
        value.type === 'comparison'
          ? [value]
          : value.type === 'and' || value.type === 'or'
            ? (value.children as ComparisonNode[])
            : [def];
      onChange({ type: mode, children: existing });
    }
  }

  function updateComp(idx: number, patch: Partial<ComparisonNode>) {
    if (value.type === 'comparison') {
      onChange({ ...value, ...patch });
    } else if (value.type === 'and' || value.type === 'or') {
      const children = (value.children as ComparisonNode[]).map((c, i) =>
        i === idx ? { ...c, ...patch } : c,
      );
      onChange({ ...value, children });
    }
  }

  function addChild() {
    if (value.type !== 'and' && value.type !== 'or') return;
    const newChild: ComparisonNode = {
      type: 'comparison',
      field: 'hoursUntilStart',
      op: 'lt',
      value: '24',
    };
    onChange({ ...value, children: [...(value.children as ComparisonNode[]), newChild] });
  }

  function removeChild(idx: number) {
    if (value.type !== 'and' && value.type !== 'or') return;
    const filtered = (value.children as ComparisonNode[]).filter((_, i) => i !== idx);
    if (filtered.length === 1) onChange(filtered[0]!);
    else onChange({ ...value, children: filtered });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Režim</label>
        <div className="flex gap-1 flex-wrap">
          {(['always', 'single', 'and', 'or'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`px-2 py-1 text-xs rounded font-medium ${
                currentMode === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {m === 'always' ? 'Vždy' : m === 'single' ? 'Jedna' : m === 'and' ? 'AND' : 'OR'}
            </button>
          ))}
        </div>
      </div>

      {value.type === 'comparison' && (
        <ComparisonRow node={value} onChange={(p) => updateComp(0, p)} />
      )}

      {(value.type === 'and' || value.type === 'or') &&
        (value.children as ComparisonNode[]).map((c, idx) => (
          <div key={idx} className="flex items-start gap-1">
            <div className="flex-1">
              {idx > 0 && (
                <div className="text-xs text-blue-600 font-semibold mb-1">
                  {value.type === 'and' ? 'A ZÁROVEŇ' : 'NEBO'}
                </div>
              )}
              <ComparisonRow node={c} onChange={(p) => updateComp(idx, p)} />
            </div>
            {(value.children as ComparisonNode[]).length > 1 && (
              <button
                type="button"
                onClick={() => removeChild(idx)}
                className="text-red-500 text-sm mt-1"
                title="Odstranit"
              >
                ×
              </button>
            )}
          </div>
        ))}
      {(value.type === 'and' || value.type === 'or') && (
        <button
          type="button"
          onClick={addChild}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          + Přidat další podmínku
        </button>
      )}
    </div>
  );
}

function ComparisonRow({
  node,
  onChange,
}: {
  node: ComparisonNode;
  onChange: (patch: Partial<ComparisonNode>) => void;
}) {
  return (
    <div className="space-y-1">
      <select
        value={node.field}
        onChange={(e) => onChange({ field: e.target.value })}
        className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
      >
        {FIELD_OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-1">
        <select
          value={node.op}
          onChange={(e) => onChange({ op: e.target.value as Operator })}
          className="px-2 py-1 border border-slate-300 rounded text-xs"
        >
          {OP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={String(node.value ?? '')}
          onChange={(e) => onChange({ value: e.target.value })}
          className="px-2 py-1 border border-slate-300 rounded text-xs"
          placeholder="hodnota"
        />
      </div>
    </div>
  );
}

function ActionEditor({
  value,
  onChange,
  onRemove,
}: {
  value: { type: ActionType; config: Record<string, unknown> };
  onChange: (v: { type: ActionType; config: Record<string, unknown> }) => void;
  onRemove: () => void;
}) {
  function setType(type: ActionType) {
    onChange({ type, config: defaultConfig(type) });
  }
  function setConfig(patch: Record<string, unknown>) {
    onChange({ ...value, config: { ...value.config, ...patch } });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-700">Typ akce</label>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-600 hover:text-red-800"
        >
          Odstranit akci
        </button>
      </div>
      <select
        value={value.type}
        onChange={(e) => setType(e.target.value as ActionType)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      >
        {ACTION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {value.type === 'log_message' && (
        <input
          type="text"
          value={String(value.config.message ?? '')}
          onChange={(e) => setConfig({ message: e.target.value })}
          placeholder="Text zprávy"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      )}
      {value.type === 'send_email' && (
        <div className="space-y-2">
          <input
            type="text"
            value={String(value.config.subject ?? '')}
            onChange={(e) => setConfig({ subject: e.target.value })}
            placeholder="Předmět"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <textarea
            value={String(value.config.body ?? '')}
            onChange={(e) => setConfig({ body: e.target.value })}
            rows={3}
            placeholder="Tělo ({{customerName}}, {{referenceCode}}, ...)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <input
            type="text"
            value={String(value.config.to ?? '')}
            onChange={(e) => setConfig({ to: e.target.value })}
            placeholder="Komu (prázdné = zákazník)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      )}
      {value.type === 'add_customer_tag' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={String(value.config.tag ?? '')}
            onChange={(e) => setConfig({ tag: e.target.value })}
            placeholder="Tag"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <input
            type="color"
            value={String(value.config.color ?? '#ef4444')}
            onChange={(e) => setConfig({ color: e.target.value })}
            className="w-full h-10 border border-slate-300 rounded-lg"
          />
        </div>
      )}
      {value.type === 'charge_storno_fee' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={Number(value.config.percent ?? 50)}
            onChange={(e) => setConfig({ percent: Number(e.target.value) })}
            min={0}
            max={100}
            className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <span className="text-xs text-slate-500">% z ceny</span>
        </div>
      )}
      {value.type === 'deduct_credit_pack' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={Number(value.config.credits ?? 1)}
            onChange={(e) => setConfig({ credits: Number(e.target.value) })}
            min={1}
            max={50}
            className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <span className="text-xs text-slate-500">kreditů</span>
        </div>
      )}
      {value.type === 'webhook' && (
        <input
          type="url"
          value={String(value.config.url ?? '')}
          onChange={(e) => setConfig({ url: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      )}
    </div>
  );
}

function defaultConfig(type: ActionType): Record<string, unknown> {
  switch (type) {
    case 'log_message':
      return { message: '' };
    case 'send_email':
      return { subject: '', body: '', to: '' };
    case 'add_customer_tag':
    case 'remove_customer_tag':
      return { tag: '', color: '#ef4444' };
    case 'charge_storno_fee':
      return { percent: 50 };
    case 'deduct_credit_pack':
      return { credits: 1 };
    case 'webhook':
      return { url: '' };
  }
}

// ─── Main component ─────────────────────────────────────────────────

export function VisualRuleBuilder({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: RuleFormState;
  onChange: (form: RuleFormState) => void;
  onSave: (form: RuleFormState) => void;
  onCancel: () => void;
}) {
  const graph = useMemo(() => ruleToGraph(form), [form]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, , onEdgesChange] = useEdgesState(graph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('trigger');
  const [saving, setSaving] = useState(false);

  // Sync graph when form changes externally
  useEffect(() => {
    setNodes(graph.nodes);
  }, [graph.nodes, setNodes]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  function addAction() {
    onChange({
      ...form,
      actions: [...form.actions, { type: 'log_message', config: { message: '' } }],
    });
    // Vybrat novy node
    setTimeout(() => setSelectedNodeId(`action-${form.actions.length}`), 50);
  }

  function removeAction(idx: number) {
    onChange({ ...form, actions: form.actions.filter((_, i) => i !== idx) });
    setSelectedNodeId(null);
  }

  function updateAction(
    idx: number,
    action: { type: ActionType; config: Record<string, unknown> },
  ) {
    const newActions = [...form.actions];
    newActions[idx] = action;
    onChange({ ...form, actions: newActions });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedActionIdx = selectedNode?.id.startsWith('action-')
    ? Number(selectedNode.id.split('-')[1])
    : null;
  const selectedAction = selectedActionIdx !== null ? form.actions[selectedActionIdx] : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          <strong>Vizuální editor</strong> — klikni na uzel pro úpravu, „+ Akce" přidá novou.
        </div>
        <button
          type="button"
          onClick={addAction}
          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded font-medium"
        >
          + Akce
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr,320px]">
        <div style={{ height: 500 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Side panel */}
        <div className="border-l border-slate-200 bg-slate-50 p-3 overflow-auto max-h-[500px]">
          {!selectedNode ? (
            <div className="text-sm text-slate-500 text-center py-8">
              Klikni na uzel v grafu pro úpravu.
            </div>
          ) : selectedNode.id === 'trigger' ? (
            <TriggerEditor
              value={form.triggerEvent}
              onChange={(v) => onChange({ ...form, triggerEvent: v })}
            />
          ) : selectedNode.id === 'condition' ? (
            <ConditionEditor
              value={form.condition}
              onChange={(v) => onChange({ ...form, condition: v })}
            />
          ) : selectedActionIdx !== null && selectedAction ? (
            <ActionEditor
              value={selectedAction}
              onChange={(v) => updateAction(selectedActionIdx, v)}
              onRemove={() => removeAction(selectedActionIdx)}
            />
          ) : null}
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 flex justify-end gap-2 bg-white">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-medium text-sm"
        >
          Zrušit
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !form.name}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium text-sm disabled:opacity-50"
        >
          {saving ? 'Ukládám…' : form.id ? 'Uložit změny' : 'Vytvořit pravidlo'}
        </button>
      </div>
    </div>
  );
}
