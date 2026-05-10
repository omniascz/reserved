import { z } from 'zod';

// POST /api/v1/auth/register — vytvoří nový tenant + owner uživatele.
// Per reserved-docs/17_onboarding_flow.md:
//   - žádost o slug: kebab-case, 2-32 znaků
//   - email + heslo: standard
//   - business name: pro tenant.name, 2-200 znaků

const SLUG_REGEX = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

export const RegisterSchema = z.object({
  tenantSlug: z
    .string()
    .min(2)
    .max(32)
    .regex(SLUG_REGEX, 'Slug musí být kebab-case (a-z, 0-9, pomlčka), začínat písmenem.'),
  tenantName: z.string().min(2).max(200),
  email: z.string().email().max(255),
  password: z
    .string()
    .min(10, 'Heslo musí mít alespoň 10 znaků.')
    .max(128, 'Heslo nesmí být delší než 128 znaků.'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(32).optional(),
  /** Doporučená měna (CZK, EUR, USD); default CZK pro CZ market. */
  currency: z.enum(['CZK', 'EUR', 'USD']).default('CZK'),
  /** Lokalizace (cs-CZ, en-US, atd.); default cs-CZ. */
  locale: z.string().min(2).max(8).default('cs-CZ'),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
