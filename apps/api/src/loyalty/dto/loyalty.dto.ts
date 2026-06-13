import { z } from 'zod';

// Sprint 10.8 — věrnostní body.

export const RedeemPointsSchema = z.object({
  points: z.number().int().min(1).max(1000000),
  note: z.string().max(500).optional().nullable(),
});
export type RedeemPointsDto = z.infer<typeof RedeemPointsSchema>;

export const AdjustPointsSchema = z.object({
  /** Kladné = připsat, záporné = odebrat. */
  points: z.number().int().min(-1000000).max(1000000),
  note: z.string().min(1).max(500),
});
export type AdjustPointsDto = z.infer<typeof AdjustPointsSchema>;
