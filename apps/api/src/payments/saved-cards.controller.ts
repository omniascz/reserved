// Uložené karty zákazníka — administrace (P4).
//
// Recepce / manažer pošle zákazníkovi odkaz, kde si kartu uloží (stránka
// Stripe), vidí, jakou kartu má uloženou, a může ji odebrat. Samotné
// strhávání dělá pravidlo charge_storno_fee (PaymentsService.chargeStornoFee).

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@reserved/db';
import { serviceContext, type AppRole } from '@reserved/rls-multitenancy';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { DbService } from '../db/db.service.js';
import { EmailService } from '../email/email.service.js';
import { SavedCardsService } from './saved-cards.service.js';

const VIEW_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];
const REMOVE_ROLES: AppRole[] = ['owner', 'manager'];

function assertRole(role: AppRole, allowed: AppRole[]): void {
  if (!allowed.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Nedostatečná oprávnění.' },
    });
  }
}

const StartSetupSchema = z
  .object({
    /** Poslat zákazníkovi odkaz e-mailem (jinak jen vrátit, např. pro SMS). */
    sendEmail: z.boolean().default(true),
  })
  .strict();
type StartSetupDto = z.infer<typeof StartSetupSchema>;

@Controller('admin/customers/:customerId/cards')
export class SavedCardsController {
  constructor(
    @Inject(SavedCardsService) private readonly cards: SavedCardsService,
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    assertRole(user.role, VIEW_ROLES);
    return { data: await this.cards.listForCustomer(user.tenantId, customerId) };
  }

  /** Odkaz na stránku Stripe, kde si zákazník kartu uloží. */
  @Post('setup')
  @HttpCode(201)
  async startSetup(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(StartSetupSchema)) dto: StartSetupDto,
  ) {
    assertRole(user.role, VIEW_ROLES);
    const tenant = await this.dbService.withRlsContext(serviceContext(user.tenantId), (tx) =>
      tx
        .select({ name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, user.tenantId))
        .limit(1),
    );
    const { setupUrl } = await this.cards.startCardSetup({
      tenantId: user.tenantId,
      customerId,
      ...(await this.cards.portalReturnUrls(user.tenantId)),
    });

    let emailed = false;
    if (dto.sendEmail) {
      const [customer] = await this.dbService.withRlsContext(serviceContext(user.tenantId), (tx) =>
        tx
          .select({ email: schema.customers.email })
          .from(schema.customers)
          .where(eq(schema.customers.id, customerId))
          .limit(1),
      );
      if (customer?.email) {
        await this.email.enqueue({
          tenantId: user.tenantId,
          templateCode: 'custom',
          recipient: customer.email,
          vars: {
            __customSubject: `Uložení platební karty — ${tenant[0]?.name ?? ''}`.trim(),
            __customBody:
              'Dobrý den,\n\nprosíme o uložení platební karty k vašim rezervacím. ' +
              'Kartu zadáváte na zabezpečené stránce platební brány Stripe, my její číslo neuvidíme. ' +
              'Kartu použijeme jen pro storno nebo no-show poplatek podle obchodních podmínek.\n\n' +
              `Uložit kartu: ${setupUrl}`,
          },
        });
        emailed = true;
      }
    }
    return { data: { setupUrl, emailed } };
  }

  @Delete(':cardId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
  ): Promise<void> {
    assertRole(user.role, REMOVE_ROLES);
    await this.cards.remove(user.tenantId, customerId, cardId);
  }
}
