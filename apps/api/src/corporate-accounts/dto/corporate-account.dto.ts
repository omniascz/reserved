import { z } from 'zod';

// CZ DIČ: CZ + 8-10 cifer. Pripadne EU VAT id (libovolny pattern).
const VAT_ID = /^[A-Z]{2}[0-9A-Z]{8,12}$/;
// CZ IČO: 8 cifer.
const REG_ID = /^[0-9]{6,12}$/;

export const CreateCorporateAccountSchema = z.object({
  companyName: z.string().min(1).max(200),
  vatId: z
    .string()
    .regex(VAT_ID, 'DIČ musí být ve formátu CZ12345678 nebo podobném.')
    .optional()
    .nullable(),
  companyRegId: z.string().regex(REG_ID, 'IČO musí obsahovat 6-12 cifer.').optional().nullable(),
  billingAddressLine1: z.string().max(200).optional().nullable(),
  billingAddressLine2: z.string().max(200).optional().nullable(),
  billingCity: z.string().max(100).optional().nullable(),
  billingZip: z.string().max(20).optional().nullable(),
  billingCountry: z.string().length(2).default('CZ'),
  contactEmail: z.string().email().max(255).optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  contactPersonName: z.string().max(200).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().default(true),
});
export type CreateCorporateAccountDto = z.infer<typeof CreateCorporateAccountSchema>;

export const UpdateCorporateAccountSchema = CreateCorporateAccountSchema.partial();
export type UpdateCorporateAccountDto = z.infer<typeof UpdateCorporateAccountSchema>;

// Member management
export const AddMemberSchema = z.object({
  customerId: z.string().uuid(),
  role: z.enum(['member', 'admin']).default('member'),
});
export type AddMemberDto = z.infer<typeof AddMemberSchema>;

export const UpdateMemberSchema = z.object({
  role: z.enum(['member', 'admin']),
});
export type UpdateMemberDto = z.infer<typeof UpdateMemberSchema>;
