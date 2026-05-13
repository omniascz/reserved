import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CreditPacksController } from './credit-packs.controller.js';
import { CreditPacksService } from './credit-packs.service.js';

@Module({
  imports: [DbModule],
  controllers: [CreditPacksController],
  providers: [CreditPacksService],
  exports: [CreditPacksService],
})
export class CreditPacksModule {}
