import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { ReferralsAdminController } from './referrals.controller.js';
import { ReferralsService } from './referrals.service.js';

@Module({
  imports: [DbModule],
  controllers: [ReferralsAdminController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
