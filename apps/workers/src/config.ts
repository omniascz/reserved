import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  DATABASE_APP_URL: z.string().min(1).optional(),
  WORKER_NOTIFICATION_TICK_SECONDS: z.coerce.number().int().positive().default(5),
  WORKER_HOLD_EXPIRY_TICK_SECONDS: z.coerce.number().int().positive().default(30),
  // Email
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1026),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@reserved.local'),
  EMAIL_FROM_NAME: z.string().default('Reserved'),
  // SMS
  SMS_PROVIDER: z.enum(['mock', 'bulkgate']).default('mock'),
  BULKGATE_APP_ID: z.string().optional(),
  BULKGATE_APP_TOKEN: z.string().optional(),
  BULKGATE_SENDER: z.string().default('Reserved'),
  // WhatsApp Business
  WHATSAPP_PROVIDER: z.enum(['mock', 'bulkgate']).default('mock'),
  /** Číslo registrované jako WhatsApp Business sender (E.164). */
  BULKGATE_WHATSAPP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadConfig(): Env {
  return EnvSchema.parse(process.env);
}
