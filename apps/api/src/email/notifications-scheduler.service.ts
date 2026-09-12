// NotificationsScheduler — vloží plánovanou zprávu do `notifications` fronty.
// Worker (apps/workers) ji v daný čas vezme a pošle (email/SMS).
//
// Použití: reminder 24h před rezervací, reaktivační kampaně po N dnech bez
// aktivity, narozeninový email v den narozenin atd.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { renderEmail, type EmailVars } from './templates.js';

export interface ScheduleEmailInput {
  tenantId: string;
  templateCode: string;
  recipient: string;
  vars: EmailVars;
  /** Kdy poslat (UTC). Pokud je v minulosti, worker pošle hned. */
  scheduledAt: Date;
  relatedBookingId?: string | null;
}

export interface ScheduleSmsInput {
  tenantId: string;
  templateCode: string;
  /** E.164 telefonní číslo (+420...). */
  recipient: string;
  body: string;
  scheduledAt: Date;
  relatedBookingId?: string | null;
}

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger('NotificationsScheduler');

  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async scheduleEmail(input: ScheduleEmailInput): Promise<{ id: string }> {
    const { subject, body } = renderEmail(input.templateCode, input.vars);

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
            scheduledAt: input.scheduledAt,
            status: 'pending',
          })
          .returning({ id: schema.notifications.id });
        return row!;
      },
    );

    this.logger.log(
      `Scheduled email ${input.templateCode} for ${input.recipient} at ${input.scheduledAt.toISOString()}`,
    );
    return { id: inserted.id };
  }

  async scheduleSms(input: ScheduleSmsInput): Promise<{ id: string }> {
    const inserted = await this.dbService.withRlsContext(
      serviceContext(input.tenantId),
      async (tx) => {
        const [row] = await tx
          .insert(schema.notifications)
          .values({
            tenantId: input.tenantId,
            channel: 'sms',
            templateCode: input.templateCode,
            recipient: input.recipient,
            body: input.body,
            relatedBookingId: input.relatedBookingId ?? null,
            scheduledAt: input.scheduledAt,
            status: 'pending',
          })
          .returning({ id: schema.notifications.id });
        return row!;
      },
    );

    this.logger.log(
      `Scheduled SMS ${input.templateCode} for ${input.recipient} at ${input.scheduledAt.toISOString()}`,
    );
    return { id: inserted.id };
  }
}
