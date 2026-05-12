// Rules engine — domain types.
//
// Trigger event: konkrétní událost v systému, která vyvolá vyhodnocení pravidel.
// Condition: boolean strom (AND/OR + comparison leaves) na payloadu eventu.
// Action: instrukce k provedení (send email / charge fee / add tag / ...).

export const TRIGGER_EVENTS = [
  'booking_created',
  'booking_cancelled',
  'booking_rescheduled',
  'booking_completed',
  'booking_no_show',
  'customer_registered',
] as const;

export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

// ─── Condition tree ─────────────────────────────────────────────────────

export type Operator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with'
  | 'is_empty'
  | 'is_not_empty';

export interface ComparisonNode {
  type: 'comparison';
  /** Cesta k poli v event payloadu, např. "booking.hoursUntilStart". */
  field: string;
  op: Operator;
  /** Hodnota k porovnání. Pro 'in'/'not_in' může být array. */
  value: unknown;
}

export interface AndNode {
  type: 'and';
  children: ConditionNode[];
}

export interface OrNode {
  type: 'or';
  children: ConditionNode[];
}

export interface NotNode {
  type: 'not';
  child: ConditionNode;
}

/** Always-true (žádné podmínky, vždy match). */
export interface AlwaysNode {
  type: 'always';
}

export type ConditionNode = ComparisonNode | AndNode | OrNode | NotNode | AlwaysNode;

// ─── Actions ───────────────────────────────────────────────────────────

export const ACTION_TYPES = [
  'send_email',
  'add_customer_tag',
  'remove_customer_tag',
  'log_message',
  'charge_storno_fee',
  'webhook',
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export interface Action {
  type: ActionType;
  /** Konfigurace specifická pro daný typ akce. */
  config: Record<string, unknown>;
}

// ─── Event payload (vstup do evaluatoru) ────────────────────────────────

export interface BookingEventPayload {
  bookingId: string;
  customerId: string | null;
  customerEmail: string;
  customerName: string;
  serviceId: string;
  serviceName?: string;
  employeeId: string | null;
  branchId: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  status: string;
  pricePaidHellers: number;
  /** Vypočtený rozdíl v hodinách mezi teď a startsAt — užitečné pro `hoursUntilStart` podmínky. */
  hoursUntilStart: number;
  /** Pro reschedule/cancel: kdo akci provedl ('customer' | 'admin' | 'system'). */
  triggeredBy?: 'customer' | 'admin' | 'system';
  reason?: string | null;
}

export interface RuleEvaluationContext {
  tenantId: string;
  event: TriggerEvent;
  payload: BookingEventPayload;
  /** Volitelný timestamp pro deterministické testování. */
  now?: Date;
}
