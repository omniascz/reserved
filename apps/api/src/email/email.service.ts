// EmailService — perzistuje zprávu do `notifications` tabulky + posílá přes
// nodemailer (Mailhog v dev, real SMTP v prod). Selhání skončí ve frontě jako
// 'failed' s `last_error`.

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import nodemailer, { type Transporter } from 'nodemailer';
import { DbService } from '../db/db.service.js';
import { EmailConfig } from './email.config.js';
import { renderEmail, type EmailVars } from './templates.js';

export interface EnqueueEmailInput {
  tenantId: string;
  templateCode: string;
  recipient: string;
  vars: EmailVars;
  relatedBookingId?: string | null;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger('EmailService');
  private transporter!: Transporter;

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailConfig) private readonly config: EmailConfig,
  ) {}

  onModuleInit(): void {
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.port === 465,
      auth: this.config.authEnabled
        ? { user: this.config.user, pass: this.config.pass }
        : undefined,
      // Mailhog nevyžaduje TLS
      ignoreTLS: this.config.host === 'localhost',
    });
  }

  /**
   * Uloží zprávu do fronty (notifications tabulka) a okamžitě se pokusí poslat.
   * Pokud selže, zůstane v tabulce s status='failed' a může se retryovat.
   */
  async enqueue(input: EnqueueEmailInput): Promise<{ id: string; status: string }> {
    const { subject, body } = renderEmail(input.templateCode, input.vars);

    // 1. Insert do fronty
    const inserted = await this.dbService.withRlsContext(
      serviceContext(input.tenantId),
      async (tx) => {
        const [row] = await tx
          .insert(schema.notifications)
          .values({
            tenantId: input.tenantId,
            channel: 'email',
            templateCode: input.templateCode,
            recipient: input.recipient,
            subject,
            body,
            relatedBookingId: input.relatedBookingId ?? null,
            status: 'pending',
          })
          .returning();
        return row!;
      },
    );

    // 2. Pokus o okamžité odeslání
    try {
      const info = await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to: input.recipient,
        subject,
        text: body,
      });

      await this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
        await tx
          .update(schema.notifications)
          .set({
            status: 'sent',
            sentAt: new Date(),
            providerMessageId: info.messageId ?? null,
            attempts: 1,
          })
          .where(eq(schema.notifications.id, inserted.id));
      });

      return { id: inserted.id, status: 'sent' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Email send failed for ${input.recipient}: ${message}`);

      await this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
        await tx
          .update(schema.notifications)
          .set({
            status: 'failed',
            attempts: 1,
            lastError: message,
          })
          .where(eq(schema.notifications.id, inserted.id));
      });

      return { id: inserted.id, status: 'failed' };
    }
  }
}
