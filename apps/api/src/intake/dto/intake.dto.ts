import { z } from 'zod';

// Sprint 10.10 — intake / consent formuláře.

export const IntakeFieldSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  type: z.enum(['text', 'textarea', 'select', 'checkbox', 'date']),
  required: z.boolean().default(false),
  options: z.array(z.string().max(200)).max(50).optional(),
});
export type IntakeField = z.infer<typeof IntakeFieldSchema>;

export const CreateFormSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  fields: z.array(IntakeFieldSchema).min(1).max(50),
});
export type CreateFormDto = z.infer<typeof CreateFormSchema>;

export const UpdateFormSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  fields: z.array(IntakeFieldSchema).min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateFormDto = z.infer<typeof UpdateFormSchema>;

export const SubmitFormSchema = z.object({
  bookingId: z.string().uuid().optional().nullable(),
  customerEmail: z.string().email().max(255),
  answers: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).default({}),
});
export type SubmitFormDto = z.infer<typeof SubmitFormSchema>;
