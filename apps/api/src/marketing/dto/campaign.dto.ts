import { z } from 'zod';

// Sprint 10.7 — marketingové kampaně.

export const AudienceSchema = z.object({
  /** all_optin = všichni s marketing souhlasem; inactive_days = win-back; tag = dle štítku. */
  type: z.enum(['all_optin', 'inactive_days', 'tag']),
  /** Pro inactive_days: bez rezervace posledních N dní. */
  days: z.number().int().min(1).max(3650).optional(),
  /** Pro tag: štítek zákazníka. */
  tag: z.string().max(50).optional(),
});
export type AudienceDef = z.infer<typeof AudienceSchema>;

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(['email', 'sms', 'whatsapp']),
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1).max(5000),
  audience: AudienceSchema,
});
export type CreateCampaignDto = z.infer<typeof CreateCampaignSchema>;
