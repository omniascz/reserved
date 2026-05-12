// Rules evaluator — čistá funkce, žádné side-effects.
//
// matches(): boolean — vyhodnotí condition tree proti payloadu eventu.
// Side-effecty (poslání emailu, charge fee) jsou odpovědnost API handlerů,
// které dostanou seznam akcí k provedení.

import type { ComparisonNode, ConditionNode, RuleEvaluationContext } from './types.js';

/**
 * Vyhodnotí, jestli pravidlo s tímto stromem matchne daný event.
 * Pure: žádné side effects, žádné async operace.
 */
export function matches(tree: ConditionNode, ctx: RuleEvaluationContext): boolean {
  switch (tree.type) {
    case 'always':
      return true;
    case 'comparison':
      return evaluateComparison(tree, ctx);
    case 'and':
      return tree.children.every((child) => matches(child, ctx));
    case 'or':
      return tree.children.some((child) => matches(child, ctx));
    case 'not':
      return !matches(tree.child, ctx);
  }
}

function evaluateComparison(node: ComparisonNode, ctx: RuleEvaluationContext): boolean {
  const actual = resolveField(node.field, ctx);
  const expected = node.value;

  switch (node.op) {
    case 'eq':
      return looseEquals(actual, expected);
    case 'ne':
      return !looseEquals(actual, expected);
    case 'gt':
      return numericCompare(actual, expected, (a, b) => a > b);
    case 'gte':
      return numericCompare(actual, expected, (a, b) => a >= b);
    case 'lt':
      return numericCompare(actual, expected, (a, b) => a < b);
    case 'lte':
      return numericCompare(actual, expected, (a, b) => a <= b);
    case 'in':
      return Array.isArray(expected) && expected.some((v) => looseEquals(actual, v));
    case 'not_in':
      return Array.isArray(expected) && !expected.some((v) => looseEquals(actual, v));
    case 'contains':
      return (
        typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)
      );
    case 'starts_with':
      return (
        typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected)
      );
    case 'is_empty':
      return (
        actual === null ||
        actual === undefined ||
        actual === '' ||
        (Array.isArray(actual) && actual.length === 0)
      );
    case 'is_not_empty':
      return !(
        actual === null ||
        actual === undefined ||
        actual === '' ||
        (Array.isArray(actual) && actual.length === 0)
      );
  }
}

/** Dot-notation field lookup: "booking.hoursUntilStart" → payload.hoursUntilStart. */
function resolveField(field: string, ctx: RuleEvaluationContext): unknown {
  // Top-level: tenantId, event, now, nebo payload.*
  if (field === 'tenantId') return ctx.tenantId;
  if (field === 'event') return ctx.event;
  if (field === 'now') return (ctx.now ?? new Date()).toISOString();

  // Zbytek = pole v payloadu. Strip 'booking.' nebo 'customer.' prefix.
  const cleaned = field.replace(/^(booking|customer|event)\./, '');
  const parts = cleaned.split('.');
  let current: unknown = ctx.payload;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  // Number/string coercion (např. user napíše "100" do JSON config)
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  return false;
}

function numericCompare(a: unknown, b: unknown, cmp: (x: number, y: number) => boolean): boolean {
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  return cmp(na, nb);
}
