import { describe, expect, it } from 'vitest';
import { matches } from '../evaluator.js';
import type { BookingEventPayload, ConditionNode, RuleEvaluationContext } from '../types.js';

function ctx(overrides: Partial<BookingEventPayload> = {}): RuleEvaluationContext {
  const payload: BookingEventPayload = {
    bookingId: 'b-1',
    customerId: 'c-1',
    customerEmail: 'jana@example.cz',
    customerName: 'Jana Nováková',
    serviceId: 's-1',
    serviceName: 'EMS trénink',
    employeeId: 'e-1',
    branchId: 'br-1',
    startsAt: '2026-06-01T10:00:00Z',
    endsAt: '2026-06-01T10:30:00Z',
    status: 'cancelled',
    pricePaidHellers: 50000, // 500 Kč
    hoursUntilStart: 6,
    triggeredBy: 'customer',
    reason: 'klient zmenil plan',
    ...overrides,
  };
  return {
    tenantId: 'tenant-1',
    event: 'booking_cancelled',
    payload,
    now: new Date('2026-06-01T04:00:00Z'),
  };
}

describe('Rules evaluator — matches()', () => {
  describe('AlwaysNode', () => {
    it('always returns true', () => {
      const node: ConditionNode = { type: 'always' };
      expect(matches(node, ctx())).toBe(true);
    });
  });

  describe('ComparisonNode — numeric ops', () => {
    it('lt — true when actual < expected', () => {
      const node: ConditionNode = {
        type: 'comparison',
        field: 'hoursUntilStart',
        op: 'lt',
        value: 12,
      };
      expect(matches(node, ctx({ hoursUntilStart: 6 }))).toBe(true);
      expect(matches(node, ctx({ hoursUntilStart: 24 }))).toBe(false);
    });

    it('gte — true when actual >= expected', () => {
      const node: ConditionNode = {
        type: 'comparison',
        field: 'pricePaidHellers',
        op: 'gte',
        value: 100000,
      };
      expect(matches(node, ctx({ pricePaidHellers: 100000 }))).toBe(true);
      expect(matches(node, ctx({ pricePaidHellers: 50000 }))).toBe(false);
    });

    it('coerces string to number when comparing', () => {
      // User v UI zadava values jako string '12'
      const node: ConditionNode = {
        type: 'comparison',
        field: 'hoursUntilStart',
        op: 'lt',
        value: '12',
      };
      expect(matches(node, ctx({ hoursUntilStart: 6 }))).toBe(true);
    });
  });

  describe('ComparisonNode — string ops', () => {
    it('eq — exact match', () => {
      const node: ConditionNode = {
        type: 'comparison',
        field: 'status',
        op: 'eq',
        value: 'cancelled',
      };
      expect(matches(node, ctx({ status: 'cancelled' }))).toBe(true);
      expect(matches(node, ctx({ status: 'completed' }))).toBe(false);
    });

    it('contains — substring match', () => {
      const node: ConditionNode = {
        type: 'comparison',
        field: 'reason',
        op: 'contains',
        value: 'plan',
      };
      expect(matches(node, ctx({ reason: 'klient zmenil plan' }))).toBe(true);
      expect(matches(node, ctx({ reason: 'nemoc' }))).toBe(false);
    });

    it('in — value is in array', () => {
      const node: ConditionNode = {
        type: 'comparison',
        field: 'status',
        op: 'in',
        value: ['cancelled', 'no_show'],
      };
      expect(matches(node, ctx({ status: 'cancelled' }))).toBe(true);
      expect(matches(node, ctx({ status: 'completed' }))).toBe(false);
    });
  });

  describe('ComparisonNode — null checks', () => {
    it('is_empty — true for null/empty/undefined', () => {
      const node: ConditionNode = {
        type: 'comparison',
        field: 'reason',
        op: 'is_empty',
        value: null,
      };
      expect(matches(node, ctx({ reason: null }))).toBe(true);
      expect(matches(node, ctx({ reason: '' }))).toBe(true);
      expect(matches(node, ctx({ reason: 'something' }))).toBe(false);
    });
  });

  describe('AndNode', () => {
    it('returns true only when ALL children match', () => {
      const node: ConditionNode = {
        type: 'and',
        children: [
          { type: 'comparison', field: 'hoursUntilStart', op: 'lt', value: 12 },
          { type: 'comparison', field: 'pricePaidHellers', op: 'gte', value: 30000 },
        ],
      };
      expect(matches(node, ctx({ hoursUntilStart: 6, pricePaidHellers: 50000 }))).toBe(true);
      expect(matches(node, ctx({ hoursUntilStart: 24, pricePaidHellers: 50000 }))).toBe(false);
      expect(matches(node, ctx({ hoursUntilStart: 6, pricePaidHellers: 10000 }))).toBe(false);
    });
  });

  describe('OrNode', () => {
    it('returns true when ANY child matches', () => {
      const node: ConditionNode = {
        type: 'or',
        children: [
          { type: 'comparison', field: 'status', op: 'eq', value: 'no_show' },
          { type: 'comparison', field: 'hoursUntilStart', op: 'lt', value: 2 },
        ],
      };
      expect(matches(node, ctx({ status: 'no_show', hoursUntilStart: 24 }))).toBe(true);
      expect(matches(node, ctx({ status: 'cancelled', hoursUntilStart: 1 }))).toBe(true);
      expect(matches(node, ctx({ status: 'completed', hoursUntilStart: 24 }))).toBe(false);
    });
  });

  describe('NotNode', () => {
    it('inverts child result', () => {
      const node: ConditionNode = {
        type: 'not',
        child: { type: 'comparison', field: 'status', op: 'eq', value: 'completed' },
      };
      expect(matches(node, ctx({ status: 'cancelled' }))).toBe(true);
      expect(matches(node, ctx({ status: 'completed' }))).toBe(false);
    });
  });

  describe('Field resolution', () => {
    it('resolves dot-notation prefix (booking.X, customer.X)', () => {
      const node: ConditionNode = {
        type: 'comparison',
        field: 'booking.status',
        op: 'eq',
        value: 'cancelled',
      };
      expect(matches(node, ctx({ status: 'cancelled' }))).toBe(true);
    });

    it('returns undefined for unknown field — false in numeric compare', () => {
      const node: ConditionNode = {
        type: 'comparison',
        field: 'nonexistent',
        op: 'lt',
        value: 10,
      };
      expect(matches(node, ctx())).toBe(false);
    });
  });
});
