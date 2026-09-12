import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { MakeupController } from './makeup.controller.js';
import { MakeupService } from './makeup.service.js';

@Module({
  imports: [DbModule],
  controllers: [MakeupController],
  providers: [MakeupService],
  exports: [MakeupService],
})
export class MakeupModule {}
