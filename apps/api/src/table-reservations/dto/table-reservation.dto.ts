import { z } from 'zod';

const seatingPrefs = ['indoor', 'terrace', 'bar', 'quiet', 'window'] as const;

export const CreateTableReservationSchema = z.object({
  /** Konkrétní stůl (resource type='table'). Když chybí → systém přiřadí
   *  volný stůl, případně sloučí sestavu pro velkou skupinu. */
  resourceId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  /** Směna, pro kterou rezervace platí (určí turn time / pacing / zálohu). */
  servicePeriodId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().max(255).optional().nullable(),
  customerPhone: z.string().max(32).optional().nullable(),
  /** Příchod (ISO 8601 s časovou zónou). */
  startsAt: z.string().datetime({ offset: true }),
  partySize: z.number().int().min(1).max(100),
  /** Ruční override doby sezení v minutách (jinak se odvodí ze směny). */
  turnMinutes: z.number().int().positive().max(1440).optional(),
  seatingPref: z.enum(seatingPrefs).optional().nullable(),
  occasion: z.string().max(50).optional().nullable(),
  depositHellers: z.number().int().nonnegative().default(0),
  note: z.string().max(1000).optional().nullable(),
});
export type CreateTableReservationDto = z.infer<typeof CreateTableReservationSchema>;

export const AvailableTablesSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  partySize: z.coerce.number().int().min(1).max(100),
  branchId: z.string().uuid().optional(),
  servicePeriodId: z.string().uuid().optional(),
  turnMinutes: z.coerce.number().int().positive().max(1440).optional(),
});
export type AvailableTablesDto = z.infer<typeof AvailableTablesSchema>;

/** Walk-in: host bez rezervace teď. Bez `startsAt` (server doplní now). */
export const WalkInSchema = z.object({
  resourceId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  servicePeriodId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(200).optional(),
  customerPhone: z.string().max(32).optional().nullable(),
  partySize: z.number().int().min(1).max(100),
  turnMinutes: z.number().int().positive().max(1440).optional(),
  seatingPref: z.enum(seatingPrefs).optional().nullable(),
  occasion: z.string().max(50).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});
export type WalkInDto = z.infer<typeof WalkInSchema>;

export const OverviewSchema = z.object({
  /** Okamžik, ke kterému chceme stav stolů (default teď). */
  at: z.string().datetime({ offset: true }).optional(),
  branchId: z.string().uuid().optional(),
});
export type OverviewDto = z.infer<typeof OverviewSchema>;
