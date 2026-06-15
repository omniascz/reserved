import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { LoyaltyController, LoyaltyCatalogController } from './loyalty.controller.js';
import { LoyaltyService } from './loyalty.service.js';

@Module({
  imports: [DbModule],
  controllers: [LoyaltyController, LoyaltyCatalogController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
