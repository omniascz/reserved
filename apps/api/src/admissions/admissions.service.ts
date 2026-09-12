// AdmissionsService — vstupné / day-pass do prostoru (sprint 10.41).
// Sjednocuje „vstup do wellness/bazénu/posilovny" s platbou a vstupem na kód:
// prodej vstupenky → zaznamená platbu + vydá vstupní kód (access grant), který
// turniket/kiosk ověří. Žádný smíšený dům dnes nemá vstup+platbu+lekce v jednom.

import { Inject, Injectable } from '@nestjs/common';
import { type AppRole } from '@reserved/rls-multitenancy';
import { AccessService } from '../access/access.service.js';
import { PaymentsService } from '../payments/payments.service.js';

@Injectable()
export class AdmissionsService {
  constructor(
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  /**
   * Prodá vstupenku do prostoru: vydá vstupní kód (platný N hodin) a zaznamená
   * platbu (hotovost/terminál). Vrátí kód + QR payload pro turniket/kiosk.
   */
  async sell(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: {
      name: string;
      customerName: string;
      customerId?: string | null;
      branchId?: string | null;
      priceHellers: number;
      currency?: string;
      validHours?: number;
      methodType?: 'cash' | 'card_terminal' | 'qr_bank';
    },
  ) {
    const now = Date.now();
    const grant = await this.access.issueGeneral(tenantId, userId, role, {
      customerId: dto.customerId ?? null,
      customerName: dto.customerName,
      branchId: dto.branchId ?? null,
      validFrom: new Date(now).toISOString(),
      validUntil: new Date(now + (dto.validHours ?? 12) * 3600_000).toISOString(),
      maxUses: 0, // v rámci platnosti neomezené vstupy (vstup/výstup)
      kind: 'open_gym',
    });

    let payment = null;
    if (dto.priceHellers > 0) {
      payment = await this.payments.recordPayment(tenantId, userId, role, {
        amountHellers: dto.priceHellers,
        currency: dto.currency ?? 'CZK',
        methodType: dto.methodType ?? 'cash',
        description: `Vstupné: ${dto.name}`,
      });
    }

    return {
      admission: dto.name,
      entryCode: grant.code,
      qrPayload: grant.qrPayload,
      grantId: grant.id,
      validUntil: grant.validUntil,
      paymentId: payment?.id ?? null,
      amountHellers: dto.priceHellers,
    };
  }
}
