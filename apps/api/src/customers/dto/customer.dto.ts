import { z } from 'zod';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const UpdateCustomerSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(32).optional().nullable(),
  customerType: z.enum(['regular', 'vip', 'corporate', 'risky']).optional(),
  marketingOptIn: z.boolean().optional(),
});
export type UpdateCustomerDto = z.infer<typeof UpdateCustomerSchema>;

export const CreateCustomerTagSchema = z.object({
  tag: z.string().min(1).max(50),
  color: z.string().regex(HEX_COLOR).optional().nullable(),
});
export type CreateCustomerTagDto = z.infer<typeof CreateCustomerTagSchema>;

export const CreateCustomerNoteSchema = z.object({
  note: z.string().min(1).max(5000),
  category: z.enum(['general', 'medical', 'preferences', 'warning']).default('general'),
  visibility: z.enum(['all', 'managers']).default('all'),
});
export type CreateCustomerNoteDto = z.infer<typeof CreateCustomerNoteSchema>;
