import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CreateHolidaySchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(200),
  /** Pokud true, salon má otevřeno (jen s custom time). */
  isOpen: z.boolean().default(false),
  customStartTime: z.string().regex(HHMM).optional().nullable(),
  customEndTime: z.string().regex(HHMM).optional().nullable(),
});
export type CreateHolidayDto = z.infer<typeof CreateHolidaySchema>;
