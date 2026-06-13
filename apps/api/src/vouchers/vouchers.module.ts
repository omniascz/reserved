import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { VouchersController } from './vouchers.controller.js';
import { VouchersService } from './vouchers.service.js';

@Module({
  imports: [DbModule],
  controllers: [VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
