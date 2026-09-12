import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { MarketingController } from './marketing.controller.js';
import { MarketingService } from './marketing.service.js';

@Module({
  imports: [DbModule],
  controllers: [MarketingController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
