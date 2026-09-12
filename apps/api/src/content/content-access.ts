import type { ContentAccessLevel } from '@reserved/db';

/**
 * Čistá funkce přístupu k obsahu — bez DB závislostí (testovatelná samostatně).
 *   public       → kdokoli
 *   members      → přihlášený klient
 *   subscription → klient s aktivním předplatným
 */
export function canAccessContent(
  level: ContentAccessLevel,
  ctx: { authenticated: boolean; hasSubscription: boolean },
): boolean {
  if (level === 'public') return true;
  if (level === 'members') return ctx.authenticated;
  return ctx.hasSubscription; // 'subscription'
}
