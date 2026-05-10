import { z } from 'zod';

// POST /api/v1/auth/login — přihlášení uživatele.
// tenant je resolved z TenantMiddleware (subdomain / custom domain / X-Tenant-ID),
// proto v body neuvádíme tenantId/Slug.

export const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export type LoginDto = z.infer<typeof LoginSchema>;
