import { z } from 'zod';

// Sprint 10.6 — recenze.

export const SubmitReviewSchema = z.object({
  bookingId: z.string().uuid(),
  /** Ověření, že recenzi píše skutečně zákazník dané rezervace. */
  customerEmail: z.string().email().max(255),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().nullable(),
});
export type SubmitReviewDto = z.infer<typeof SubmitReviewSchema>;

export const SetReviewVisibilitySchema = z.object({
  status: z.enum(['published', 'hidden']),
});
export type SetReviewVisibilityDto = z.infer<typeof SetReviewVisibilitySchema>;
