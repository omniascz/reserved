import { z } from 'zod';

export const CreateCourseSchema = z.object({
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  capacity: z.number().int().min(1).max(1000),
  priceHellers: z.number().int().nonnegative().default(0),
  /** Termíny jednotlivých lekcí kurzu (ISO). */
  lessons: z.array(z.string().datetime()).min(1).max(100),
});
export type CreateCourseDto = z.infer<typeof CreateCourseSchema>;

export const EnrollCourseSchema = z.object({
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().max(32).optional().nullable(),
});
export type EnrollCourseDto = z.infer<typeof EnrollCourseSchema>;
