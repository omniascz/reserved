import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { ClassSessionsModule } from '../class-sessions/class-sessions.module.js';
import { TimePacksModule } from '../time-packs/time-packs.module.js';
import { BundlePacksModule } from '../bundle-packs/bundle-packs.module.js';
import { CreditPacksModule } from '../credit-packs/credit-packs.module.js';
import { SmartController } from './smart.controller.js';
import { SmartService } from './smart.service.js';

@Module({
  imports: [
    DbModule,
    CustomersModule,
    ClassSessionsModule,
    TimePacksModule,
    BundlePacksModule,
    CreditPacksModule,
  ],
  controllers: [SmartController],
  providers: [SmartService],
  exports: [SmartService],
})
export class SmartModule {}
