import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const TurnTimeRule = z.object({
  maxParty: z.number().int().positive(),
  minutes: z.number().int().positive().max(1440),
});

export const CreateServicePeriodSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(50),
  /** Dny v týdnu 1=Po … 7=Ne. */
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1),
  startsAt: z.string().regex(HHMM, 'startsAt musí být HH:MM'),
  endsAt: z.string().regex(HHMM, 'endsAt musí být HH:MM'),
  lastSeating: z.string().regex(HHMM, 'lastSeating musí být HH:MM').optional().nullable(),
  slotIntervalMin: z.number().int().min(1).max(240).default(15),
  maxCoversPerSlot: z.number().int().positive().optional().nullable(),
  maxPartiesPerSlot: z.number().int().positive().optional().nullable(),
  turnTimeRules: z.array(TurnTimeRule).default([]),
  depositThresholdGuests: z.number().int().positive().optional().nullable(),
  depositPerGuestHellers: z.number().int().nonnegative().default(0),
});
export type CreateServicePeriodDto = z.infer<typeof CreateServicePeriodSchema>;

export const UpdateServicePeriodSchema = CreateServicePeriodSchema.partial().omit({
  branchId: true,
});
export type UpdateServicePeriodDto = z.infer<typeof UpdateServicePeriodSchema>;
