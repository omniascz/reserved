'use client';

import { useCallback, useMemo, useState } from 'react';
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
import type { RuleFormState } from './RuleEditor';

// Vizualni builder ↔ JSON tree converter.
//
// Vstupni grafu schema:
//   - 1x TriggerNode (vlevo nahore)
//   - 1x ConditionGroupNode (uprostred) — obsahuje AND/OR group + comparisons
//   - N x ActionNode (vpravo, vertikalne)
//
// Edges: trigger → condition → action[0] → action[1] → ...
//
// Layout: pevny (manualni drag uzly mohou, ale serializaci tela ignorujeme
// pri save — uklada se jen logika).

const TRIGGER_LABELS: Record<string, string> = {
  booking_created: 'Vytvořena rezervace',
  booking_cancelled: 'Zrušena rezervace',
  booking_rescheduled: 'Přesunuta rezervace',
  booking_completed: 'Dokončena rezervace',
  booking_no_show: 'Klient nedorazil',
  customer_registered: 'Nová registrace',
};

const ACTION_LABELS: Record<string, string> = {
  send_email: '📧 Poslat e-mail',
  add_customer_tag: '🏷️ Přidat tag',
  charge_storno_fee: '💰 Storno poplatek',
  deduct_credit_pack: '🎫 Strhnout kredit',
  webhook: '🔗 Webhook',
  log_message: '📝 Log zpráva',
  remove_customer_tag: '🗑️ Odebrat tag',
};

const FIELD_LABELS: Record<string, string> = {
  hoursUntilStart: 'Hodin do začátku',
  pricePaidHellers: 'Cena (haléře)',
  status: 'Stav',
  serviceId: 'ID služby',
  employeeId: 'ID zaměstnance',
  branchId: 'ID pobočky',
  triggeredBy: 'Spustil',
};

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

interface ConditionRow {
  field: string;
  op: string;
  value: unknown;
}

// ─── Node types ────────────────────────────────────────────────────────

type TriggerNodeData = { triggerEvent: string };
type ConditionNodeData = {
  mode: 'always' | 'single' | 'and' | 'or';
  conditions: ConditionRow[];
};
type ActionNodeData = {
  type: string;
  config: Record<string, unknown>;
  index: number;
};

function TriggerNode({ data }: NodeProps) {
  const d = data as unknown as TriggerNodeData;
  return (
    <div className="bg-orange-50 border-2 border-orange-400 rounded-lg px-4 py-3 min-w-[200px]">
      <div className="text-xs font-semibold text-orange-700 uppercase mb-1">① KDY</div>
      <div className="text-sm font-medium">{TRIGGER_LABELS[d.triggerEvent] ?? d.triggerEvent}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConditionGroupNode({ data }: NodeProps) {
  const d = data as unknown as ConditionNodeData;
  return (
    <div className="bg-blue-50 border-2 border-blue-400 rounded-lg px-4 py-3 min-w-[240px]">
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

function ActionNode({ data }: NodeProps) {
  const d = data as unknown as ActionNodeData;
  const label = ACTION_LABELS[d.type] ?? d.type;
  // Short summary pro config
  let summary = '';
  if (d.type === 'log_message') summary = String(d.config.message ?? '');
  else if (d.type === 'send_email') summary = String(d.config.subject ?? '');
  else if (d.type === 'add_customer_tag') summary = String(d.config.tag ?? '');
  else if (d.type === 'charge_storno_fee') summary = `${d.config.percent ?? 0}%`;
  else if (d.type === 'deduct_credit_pack') summary = `${d.config.credits ?? 1} kreditů`;
  else if (d.type === 'webhook') summary = String(d.config.url ?? '');

  return (
    <div className="bg-emerald-50 border-2 border-emerald-400 rounded-lg px-4 py-3 min-w-[200px]">
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

// ─── Conversion: RuleFormState → React Flow graph ──────────────────

function ruleToGraph(rule: RuleFormState): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Trigger
  nodes.push({
    id: 'trigger',
    type: 'trigger',
    position: { x: 0, y: 80 },
    data: { triggerEvent: rule.triggerEvent },
  });

  // Condition
  const cond = rule.condition;
  const conditionData: ConditionNodeData =
    cond.type === 'always'
      ? { mode: 'always', conditions: [] }
      : cond.type === 'comparison'
        ? { mode: 'single', conditions: [{ field: cond.field, op: cond.op, value: cond.value }] }
        : {
            mode: cond.type,
            conditions: cond.children.map((c) => ({
              field: c.field,
              op: c.op,
              value: c.value,
            })),
          };

  nodes.push({
    id: 'condition',
    type: 'condition',
    position: { x: 280, y: 80 },
    data: conditionData as unknown as Record<string, unknown>,
  });
  edges.push({ id: 'trigger->condition', source: 'trigger', target: 'condition' });

  // Actions (vertikalne)
  let prevId = 'condition';
  rule.actions.forEach((action, idx) => {
    const id = `action-${idx}`;
    nodes.push({
      id,
      type: 'action',
      position: { x: 580, y: 0 + idx * 110 },
      data: { type: action.type, config: action.config, index: idx },
    });
    edges.push({ id: `${prevId}->${id}`, source: prevId, target: id });
    prevId = id;
  });

  return { nodes, edges };
}

// ─── Component ─────────────────────────────────────────────────────

export function VisualRuleBuilder({ rule }: { rule: RuleFormState }) {
  const initial = useMemo(() => ruleToGraph(rule), [rule]);
  const [nodes, , onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          <strong>Vizuální editor</strong> — klikni na uzel pro detail. Tažením posuneš plochu.
        </div>
        <div className="text-xs text-slate-400">
          ⓘ Změny ulož přes klasický editor (přepni nahoře). Toto je zatím read-only preview.
        </div>
      </div>
      <div style={{ height: 480 }}>
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

      {selectedNode && (
        <div className="border-t border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700 mb-2">
            Detail uzlu: {selectedNode.type}
          </div>
          <pre className="text-xs bg-white p-2 rounded border border-slate-200 max-h-32 overflow-auto">
            {JSON.stringify(selectedNode.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
