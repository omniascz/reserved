import { z } from 'zod';
import { kontaktniEmail, nazevProduktu } from '@reserved/utils';

// Výchozí hodnoty odvozené ze značky (název produktu, doména) — viz komentář
// v apps/api/src/email/email.config.ts. `.default()` se vyhodnotí při načtení
// modulu; proměnné prostředí se nastavují před startem, takže to sedí.
const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  DATABASE_APP_URL: z.string().min(1).optional(),
  WORKER_NOTIFICATION_TICK_SECONDS: z.coerce.number().int().positive().default(5),
  WORKER_HOLD_EXPIRY_TICK_SECONDS: z.coerce.number().int().positive().default(30),
  /**
   * Expirace permanentek — stačí jednou za hodinu. Propadnutí není časově
   * citlivé (čtení stejně počítá stav z dat), jde o úklid uloženého sloupce.
   */
  WORKER_PACK_EXPIRY_TICK_SECONDS: z.coerce.number().int().positive().default(3600),
  /**
   * Připomínky k ověření e-mailu — kontrola po hodině. Idempotence hlídá, že
   * každá připomínka (48 h / 7 dní) odejde nejvýš jednou.
   */
  WORKER_VERIFY_REMINDER_TICK_SECONDS: z.coerce.number().int().positive().default(3600),
  /**
   * Úklid evidence neúspěšných přihlášení. Nic časově citlivého — maže se to,
   * co je starší než 30 dní, takže stačí jednou za den. Častější běh by jen
   * bez užitku zatěžoval databázi.
   */
  WORKER_AUTH_CLEANUP_TICK_SECONDS: z.coerce.number().int().positive().default(86400),
  /**
   * Základ odkazu do administrace — musí odpovídat APP_URL, se kterou odkazy
   * staví API (EmailVerificationService). Bez toho by připomínka odkazovala
   * jinam než původní ověřovací e-mail.
   */
  APP_URL: z.string().default('http://localhost:4002'),
  // Email
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1026),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default(kontaktniEmail('noreply')),
  EMAIL_FROM_NAME: z.string().default(nazevProduktu()),
  // SMS
  SMS_PROVIDER: z.enum(['mock', 'bulkgate']).default('mock'),
  BULKGATE_APP_ID: z.string().optional(),
  BULKGATE_APP_TOKEN: z.string().optional(),
  BULKGATE_SENDER: z.string().default(nazevProduktu()),
  // WhatsApp Business
  WHATSAPP_PROVIDER: z.enum(['mock', 'bulkgate']).default('mock'),
  /** Číslo registrované jako WhatsApp Business sender (E.164). */
  BULKGATE_WHATSAPP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadConfig(): Env {
  return EnvSchema.parse(process.env);
}
