import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { CreditPacksModule } from '../credit-packs/credit-packs.module.js';
import { PosController } from './pos.controller.js';
import { PosService } from './pos.service.js';

@Module({
  imports: [DbModule, CreditPacksModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
