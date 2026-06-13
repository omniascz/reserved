import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { TimePacksModule } from '../time-packs/time-packs.module.js';
import { BundlePacksModule } from '../bundle-packs/bundle-packs.module.js';
import { CreditPacksModule } from '../credit-packs/credit-packs.module.js';
import { ClassSessionsController } from './class-sessions.controller.js';
import { ClassSessionsService } from './class-sessions.service.js';

@Module({
  imports: [DbModule, CustomersModule, TimePacksModule, BundlePacksModule, CreditPacksModule],
  controllers: [ClassSessionsController],
  providers: [ClassSessionsService],
  exports: [ClassSessionsService],
})
export class ClassSessionsModule {}
