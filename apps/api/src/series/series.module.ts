import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { TimePacksModule } from '../time-packs/time-packs.module.js';
import { BundlePacksModule } from '../bundle-packs/bundle-packs.module.js';
import { CreditPacksModule } from '../credit-packs/credit-packs.module.js';
import { SeriesController } from './series.controller.js';
import { SeriesService } from './series.service.js';

@Module({
  imports: [DbModule, CustomersModule, TimePacksModule, BundlePacksModule, CreditPacksModule],
  controllers: [SeriesController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule {}
