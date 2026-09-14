import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { kontaktniEmail, nazevProduktu } from '@reserved/utils';

// ── VÝCHOZÍ HODNOTY SE ODVOZUJÍ ZE ZNAČKY ───────────────────────────────────
// Dřív tu bylo natvrdo 'Reserved' a 'noreply@reserved.local'. Po přejmenování
// produktu by se e-maily dál podepisovaly starým názvem a odcházely ze staré
// domény — a nikdo by netušil proč.
//
// POZOR: `.default()` se vyhodnotí při NAČTENÍ MODULU, ne při každém čtení.
// Proměnné prostředí se ale nastavují před startem aplikace, takže to nevadí.
// Kdo změní proměnnou za běhu, musí aplikaci restartovat — což u konfigurace
// platí stejně jako dřív.
const EmailEnvSchema = z.object({
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1026), // Mailhog dev
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().email().default(kontaktniEmail('noreply')),
  EMAIL_FROM_NAME: z.string().default(nazevProduktu()),
});

@Injectable()
export class EmailConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
  readonly from: string;
  readonly fromName: string;

  constructor() {
    const env = EmailEnvSchema.parse(process.env);
    this.host = env.SMTP_HOST;
    this.port = env.SMTP_PORT;
    this.user = env.SMTP_USER;
    this.pass = env.SMTP_PASS;
    this.from = env.EMAIL_FROM;
    this.fromName = env.EMAIL_FROM_NAME;
  }

  get authEnabled(): boolean {
    return Boolean(this.user && this.pass);
  }
}
