import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { TimePacksController } from './time-packs.controller.js';
import { TimePacksService } from './time-packs.service.js';

@Module({
  imports: [DbModule],
  controllers: [TimePacksController],
  providers: [TimePacksService],
  exports: [TimePacksService],
})
export class TimePacksModule {}
