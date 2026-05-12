import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(32).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const CancelMyBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CancelMyBookingDto = z.infer<typeof CancelMyBookingSchema>;

export const RescheduleMyBookingSchema = z.object({
  newStartsAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

export type RescheduleMyBookingDto = z.infer<typeof RescheduleMyBookingSchema>;
