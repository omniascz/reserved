import { z } from 'zod';

// Motor 3 — řetězená (vícefázová) rezervace. Segment = jedna fáze na jednom
// zdroji, s vlastním časovým oknem (offset od startu + délka). Mezi segmenty
// mohou být pauzy (kdy je zdroj volný pro jiného klienta — barvení/působení).
export const ChainedSegmentSchema = z.object({
  label: z.string().min(1).max(100),
  resourceId: z.string().uuid(),
  /** Začátek segmentu = startsAt + startOffsetMinutes. */
  startOffsetMinutes: z.number().int().min(0).max(1440),
  durationMinutes: z.number().int().min(1).max(1440),
});
export type ChainedSegmentDto = z.infer<typeof ChainedSegmentSchema>;

export const CreateChainedSchema = z.object({
  serviceId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().max(32).optional().nullable(),
  startsAt: z.string().datetime(),
  segments: z.array(ChainedSegmentSchema).min(1).max(20),
});
export type CreateChainedDto = z.infer<typeof CreateChainedSchema>;
