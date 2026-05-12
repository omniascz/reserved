// Zod schémata pro validaci rules dat při uložení z UI.

import { z } from 'zod';
import { ACTION_TYPES, TRIGGER_EVENTS } from './types.js';

const OperatorSchema = z.enum([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'contains',
  'starts_with',
  'is_empty',
  'is_not_empty',
]);

// Rekurzivní z.lazy — Zod neumí přímo recursive bez lazy.
export const ConditionNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('always') }),
    z.object({
      type: z.literal('comparison'),
      field: z.string().min(1).max(200),
      op: OperatorSchema,
      value: z.unknown(),
    }),
    z.object({
      type: z.literal('and'),
      children: z.array(ConditionNodeSchema).min(1).max(20),
    }),
    z.object({
      type: z.literal('or'),
      children: z.array(ConditionNodeSchema).min(1).max(20),
    }),
    z.object({
      type: z.literal('not'),
      child: ConditionNodeSchema,
    }),
  ]),
);

export const ActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  config: z.record(z.unknown()),
});

export const RuleInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  triggerEvent: z.enum(TRIGGER_EVENTS),
  conditions: ConditionNodeSchema,
  actions: z.array(ActionSchema).min(1).max(20),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100),
});

export type RuleInput = z.infer<typeof RuleInputSchema>;
