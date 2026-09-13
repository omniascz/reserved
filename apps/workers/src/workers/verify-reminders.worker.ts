// Verify reminders worker — připomínky k ověření e-mailu administrátora.
//
// Podle reserved-docs/17_onboarding_flow.md: po 48 hodinách první připomínka,
// po 7 dnech druhá. Pak už nic — neověřený účet má omezený provoz (nepřijímá
// veřejné rezervace, nerozesílá poštu klientům), ale otravovat ho donekonečna
// nebudeme.
//
// IDEMPOTENCE: každá připomínka odejde nejvýš JEDNOU. Hlídá se dotazem do
// `notifications` přes `metadata->>'kind'` a `metadata->>'userId'` — stejný
// postup jako u narozeninového workeru. Poller běží po hodině, takže bez téhle
// pojistky by připomínka chodila každou hodinu dokola.
//
// NOVÝ TOKEN: worker si pro odkaz vygeneruje vlastní token a do DB uloží jen
// jeho SHA-256 otisk (stejně jako EmailVerificationService). Odkazovat na
// původní token nejde — platí 24 h, takže připomínka po 7 dnech by vedla na
// mrtvý odkaz.

import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Database } from '../db.js';

/** Kolik hodin po registraci která připomínka odchází. */
const PRIPOMINKY = [
  { kind: 'verify_reminder_48h', poHodinach: 48, popis: 'po 48 hodinách' },
  { kind: 'verify_reminder_7d', poHodinach: 24 * 7, popis: 'po 7 dnech' },
] as const;

/** Platnost odkazu v připomínce — stejná jako u původního ověřovacího e-mailu. */
const TOKEN_TTL_HODIN = 24;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface VerifyReminderVysledek {
  /** Kolik připomínek se odeslalo, po jednotlivých typech. */
  odeslano: Record<string, number>;
  celkem: number;
}

export class VerifyRemindersWorker {
  constructor(
    private readonly db: Database,
    private readonly appUrl: string,
  ) {}

  async tick(): Promise<VerifyReminderVysledek> {
    const odeslano: Record<string, number> = {};
    let celkem = 0;

    for (const pripominka of PRIPOMINKY) {
      const pocet = await this.posliDavku(pripominka.kind, pripominka.poHodinach);
      odeslano[pripominka.kind] = pocet;
      celkem += pocet;
      if (pocet > 0) {
        // eslint-disable-next-line no-console
        console.log(`[verify-reminders] sent ${pocet} reminder(s) ${pripominka.popis}`);
      }
    }

    return { odeslano, celkem };
  }

  /**
   * Najde vlastníky, kteří se registrovali před `poHodinach` a dosud nepotvrdili
   * e-mail, a pošle jim připomínku daného druhu — každému nejvýš jednou.
   */
  private async posliDavku(kind: string, poHodinach: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);

      const adresati = await tx.execute(sql`
        SELECT u.id, u.tenant_id, u.email, u.first_name, u.last_name, t.name AS tenant_name
        FROM users u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE u.role = 'owner'
          AND u.email_verified_at IS NULL
          AND u.is_active = true
          AND u.deleted_at IS NULL
          AND u.email IS NOT NULL AND u.email <> ''
          AND u.created_at <= now() - (${poHodinach}::text || ' hours')::interval
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.tenant_id = u.tenant_id
              AND n.metadata->>'kind' = ${kind}
              AND n.metadata->>'userId' = u.id::text
          )
      `);

      const radky = Array.isArray(adresati) ? adresati : [];
      for (const radek of radky) {
        const r = radek as {
          id: string;
          tenant_id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          tenant_name: string | null;
        };

        // Nový token — v DB jen otisk, surový jde pouze do odkazu v e-mailu.
        const rawToken = randomBytes(32).toString('hex');
        // POZOR: do syrového SQL se `Date` předat NESMÍ — drizzle ho pošle
        // ovladači postgres-js jako parametr, který neumí serializovat
        // („Received an instance of Date") a worker spadne. Posíláme ISO text
        // s výslovným přetypováním. Odhalil to až test tohohle workeru.
        const expiresAt = new Date(Date.now() + TOKEN_TTL_HODIN * 3600_000).toISOString();
        await tx.execute(sql`
          INSERT INTO email_verifications (tenant_id, user_id, purpose, token_hash, expires_at)
          VALUES (${r.tenant_id}, ${r.id}, 'email_confirm', ${sha256(rawToken)}, ${expiresAt}::timestamptz)
        `);

        const jmeno = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'uživateli';
        const provoz = r.tenant_name ?? 'vašeho provozu';
        const odkaz = `${this.appUrl}/verify-email?token=${rawToken}`;
        const telo =
          `Dobrý den ${jmeno},\n\n` +
          `e-mail k účtu ${provoz} v Reserved zatím není potvrzený. ` +
          `Dokud ho nepotvrdíte, váš rezervační formulář nepřijímá rezervace od klientů ` +
          `a nejde rozesílat e-maily zákazníkům.\n\n` +
          `Potvrdit můžete tímto odkazem (platí ${TOKEN_TTL_HODIN} hodin):\n\n` +
          `  ${odkaz}\n\n` +
          `Pokud jste si účet nezakládali, tento e-mail ignorujte.\n\n` +
          `Tým Reserved`;

        await tx.execute(sql`
          INSERT INTO notifications
            (tenant_id, channel, template_code, recipient, subject, body, status, scheduled_at, metadata)
          VALUES (
            ${r.tenant_id}, 'email', 'custom', ${r.email},
            ${'Připomínka: potvrďte svůj e-mail — ' + provoz},
            ${telo},
            'pending', now(),
            ${JSON.stringify({ kind, userId: r.id })}::jsonb
          )
        `);
      }

      return radky.length;
    });
  }
}
