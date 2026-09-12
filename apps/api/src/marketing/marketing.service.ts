// MarketingService — kampaně + win-back (sprint 10.7).
// Cílí JEN na zákazníky s marketingovým souhlasem (GDPR). Odeslání vloží zprávy
// do fronty `notifications`; rozešle je notifications worker.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import type { Database } from '../db/db.service.js';
import { DbService } from '../db/db.service.js';
import type { AudienceDef, CreateCampaignDto } from './dto/campaign.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Pouze owner nebo manager spravuje kampaně.' },
    });
  }
}

interface Recipient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

@Injectable()
export class MarketingService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateCampaignDto) {
    assertCanManage(role);
    if (dto.audience.type === 'inactive_days' && !dto.audience.days) {
      throw new BadRequestException({
        error: { code: 'DAYS_REQUIRED', message: 'Pro win-back segment zadej počet dní.' },
      });
    }
    if (dto.audience.type === 'tag' && !dto.audience.tag) {
      throw new BadRequestException({
        error: { code: 'TAG_REQUIRED', message: 'Pro segment dle štítku zadej štítek.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.marketingCampaigns)
        .values({
          tenantId,
          name: dto.name,
          channel: dto.channel,
          subject: dto.subject ?? null,
          body: dto.body,
          audience: dto.audience,
          status: 'draft',
          createdBy: userId,
        })
        .returning();
      return row!;
    });
  }

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.marketingCampaigns)
        .where(eq(schema.marketingCampaigns.tenantId, tenantId))
        .orderBy(desc(schema.marketingCampaigns.createdAt))
        .limit(200);
    });
  }

  /** Vyřeší segment na seznam příjemců (jen s marketing souhlasem + kontaktem pro kanál). */
  private async resolveAudience(
    tx: Database,
    tenantId: string,
    channel: string,
    audience: AudienceDef,
  ): Promise<Recipient[]> {
    const conds: SQL[] = [
      eq(schema.customers.tenantId, tenantId),
      eq(schema.customers.isActive, true),
      isNull(schema.customers.deletedAt),
      eq(schema.customers.marketingOptIn, true),
    ];

    // SMS i WhatsApp jdou na telefon → vyžaduj vyplněné číslo.
    if (channel === 'sms' || channel === 'whatsapp') {
      conds.push(sql`${schema.customers.phone} IS NOT NULL AND ${schema.customers.phone} <> ''`);
    }

    if (audience.type === 'tag' && audience.tag) {
      conds.push(
        sql`EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id = ${schema.customers.id} AND ct.tenant_id = ${tenantId} AND ct.tag = ${audience.tag})`,
      );
    }

    if (audience.type === 'inactive_days' && audience.days) {
      // Win-back: bez aktivní (ne-zrušené) rezervace v posledních N dnech.
      conds.push(
        sql`NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = ${schema.customers.id} AND b.tenant_id = ${tenantId} AND b.starts_at > NOW() - (${audience.days} * INTERVAL '1 day') AND b.status NOT IN ('cancelled', 'no_show'))`,
      );
    }

    return tx
      .select({
        id: schema.customers.id,
        firstName: schema.customers.firstName,
        lastName: schema.customers.lastName,
        email: schema.customers.email,
        phone: schema.customers.phone,
      })
      .from(schema.customers)
      .where(and(...conds))
      .limit(10000);
  }

  async previewAudience(tenantId: string, userId: string, role: AppRole, campaignId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [campaign] = await tx
        .select()
        .from(schema.marketingCampaigns)
        .where(
          and(
            eq(schema.marketingCampaigns.id, campaignId),
            eq(schema.marketingCampaigns.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!campaign) {
        throw new NotFoundException({
          error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Kampaň nenalezena.' },
        });
      }
      const recipients = await this.resolveAudience(
        tx,
        tenantId,
        campaign.channel,
        campaign.audience as AudienceDef,
      );
      return {
        count: recipients.length,
        sample: recipients.slice(0, 5).map((r) => ({
          name: `${r.firstName} ${r.lastName}`.trim(),
          contact: campaign.channel === 'email' ? r.email : r.phone,
        })),
      };
    });
  }

  async send(tenantId: string, userId: string, role: AppRole, campaignId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [campaign] = await tx
        .select()
        .from(schema.marketingCampaigns)
        .where(
          and(
            eq(schema.marketingCampaigns.id, campaignId),
            eq(schema.marketingCampaigns.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!campaign) {
        throw new NotFoundException({
          error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Kampaň nenalezena.' },
        });
      }
      if (campaign.status === 'sent') {
        throw new BadRequestException({
          error: { code: 'ALREADY_SENT', message: 'Kampaň už byla odeslána.' },
        });
      }

      const recipients = await this.resolveAudience(
        tx,
        tenantId,
        campaign.channel,
        campaign.audience as AudienceDef,
      );

      const now = new Date();
      let sent = 0;
      for (const r of recipients) {
        const recipient = campaign.channel === 'email' ? r.email : r.phone;
        if (!recipient) continue;
        await tx.insert(schema.notifications).values({
          tenantId,
          channel: campaign.channel,
          templateCode: 'marketing_campaign',
          recipient,
          subject: campaign.channel === 'email' ? (campaign.subject ?? campaign.name) : null,
          body: campaign.body,
          status: 'pending',
          scheduledAt: now,
          metadata: { campaignId: campaign.id, kind: 'marketing' },
        });
        sent++;
      }

      await tx
        .update(schema.marketingCampaigns)
        .set({ status: 'sent', sentCount: sent, sentAt: now, updatedAt: now })
        .where(eq(schema.marketingCampaigns.id, campaignId));

      return { sentCount: sent };
    });
  }
}
