import { z } from 'zod';

// Jednotlivá výzva k potvrzení účasti (admin).
export const RequestConfirmationSchema = z.object({
  channel: z.enum(['email', 'sms']).default('email'),
});
export type RequestConfirmationDto = z.infer<typeof RequestConfirmationSchema>;

// Hromadná proaktivní výzva pro nadcházející rizikové rezervace.
export const RequestConfirmationsSchema = z.object({
  /** Okno dopředu (hodiny), ve kterém hledáme nadcházející rezervace. */
  withinHours: z.number().int().min(1).max(720).default(48),
  /** Minimální úroveň rizika, od které posíláme výzvu. */
  minLevel: z.enum(['low', 'medium', 'high']).default('high'),
  channel: z.enum(['email', 'sms']).default('email'),
});
export type RequestConfirmationsDto = z.infer<typeof RequestConfirmationsSchema>;

// Úklid nepotvrzených výzev → uvolnění míst.
export const SweepUnconfirmedSchema = z.object({
  /** Kolik hodin od odeslání výzvy musí uplynout, než místo uvolníme. */
  olderThanHours: z.number().int().min(1).max(720).default(24),
});
export type SweepUnconfirmedDto = z.infer<typeof SweepUnconfirmedSchema>;

// Veřejná odpověď klienta přes magic-link.
export const RespondConfirmationSchema = z.object({
  action: z.enum(['confirm', 'decline']),
});
export type RespondConfirmationDto = z.infer<typeof RespondConfirmationSchema>;
