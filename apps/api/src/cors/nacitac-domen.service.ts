// Databázová implementace zdroje ověřených vlastních domén.
//
// Stejný vzor jako `DrizzleTenantLookup`: rozhraní žije u služby, která ho
// používá, a tady je jeho implementace nad Drizzle.

import { Inject, Injectable } from '@nestjs/common';
import { and, isNotNull, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { NacitacOverenychDomen } from './povolene-originy.service.js';

@Injectable()
export class DrizzleNacitacDomen implements NacitacOverenychDomen {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async nacti(): Promise<string[]> {
    const radky = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      return tx
        .select({ domena: schema.tenants.customDomain })
        .from(schema.tenants)
        .where(
          and(
            // JEN OVĚŘENÉ. Neověřená doména je pouhé přání zákazníka — kdyby
            // stačilo si ji zapsat, mohl by si kdokoli nárokovat cizí adresu
            // a získat přístup k API z ní.
            isNotNull(schema.tenants.customDomain),
            isNotNull(schema.tenants.customDomainVerifiedAt),
            // Smazaný tenant nemá co povolovat.
            isNull(schema.tenants.deletedAt),
          ),
        );
    });

    return radky
      .map((r) => r.domena)
      .filter((d): d is string => typeof d === 'string' && d.trim() !== '');
  }
}
