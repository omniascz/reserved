import { z } from 'zod';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CreateEmployeeSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  displayName: z.string().max(200).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  color: z.string().regex(HEX_COLOR).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  isPublic: z.boolean().default(true),
  acceptsOnlineBookings: z.boolean().default(true),
  /** UUIDs poboček, kde tento zaměstnanec pracuje. */
  branchIds: z.array(z.string().uuid()).default([]),
  /** UUIDs služeb, které umí provádět. */
  serviceIds: z.array(z.string().uuid()).default([]),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateEmployeeDto = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateEmployeeDto = z.infer<typeof UpdateEmployeeSchema>;

// ─── Working hours ────────────────────────────────────────────────────

export const WorkingHoursDaySchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(HHMM, 'Čas musí být HH:MM'),
  endTime: z.string().regex(HHMM, 'Čas musí být HH:MM'),
  breakStartTime: z.string().regex(HHMM).optional().nullable(),
  breakEndTime: z.string().regex(HHMM).optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
});
export type WorkingHoursDayDto = z.infer<typeof WorkingHoursDaySchema>;

export const SetWorkingHoursSchema = z.object({
  /** Celý nový týdenní rozpis — server dropne stávající a vloží tyto. */
  schedule: z.array(WorkingHoursDaySchema),
});
export type SetWorkingHoursDto = z.infer<typeof SetWorkingHoursSchema>;
