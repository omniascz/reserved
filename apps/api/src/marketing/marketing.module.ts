import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MarketingController } from './marketing.controller.js';
import { MarketingService } from './marketing.service.js';

@Module({
  // AuthModule kvůli EmailVerificationService — neověřený účet nesmí rozesílat
  // hromadné e-maily (ochrana domény před zneužitím k spamu).
  imports: [DbModule, AuthModule],
  controllers: [MarketingController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
