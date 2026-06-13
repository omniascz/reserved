import { describe, it, expect } from 'vitest';
import { canAccessContent } from '../content-access.js';

describe('canAccessContent', () => {
  const anon = { authenticated: false, hasSubscription: false };
  const member = { authenticated: true, hasSubscription: false };
  const subscriber = { authenticated: true, hasSubscription: true };

  it('public je dostupný komukoli', () => {
    expect(canAccessContent('public', anon)).toBe(true);
    expect(canAccessContent('public', member)).toBe(true);
    expect(canAccessContent('public', subscriber)).toBe(true);
  });

  it('members vyžaduje přihlášení', () => {
    expect(canAccessContent('members', anon)).toBe(false);
    expect(canAccessContent('members', member)).toBe(true);
    expect(canAccessContent('members', subscriber)).toBe(true);
  });

  it('subscription vyžaduje aktivní předplatné', () => {
    expect(canAccessContent('subscription', anon)).toBe(false);
    expect(canAccessContent('subscription', member)).toBe(false);
    expect(canAccessContent('subscription', subscriber)).toBe(true);
  });
});
