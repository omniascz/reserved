import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { DispatchController } from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';

@Module({
  imports: [DbModule],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
