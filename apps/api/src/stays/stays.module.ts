import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { StaysController } from './stays.controller.js';
import { StaysService } from './stays.service.js';

@Module({
  imports: [DbModule],
  controllers: [StaysController],
  providers: [StaysService],
  exports: [StaysService],
})
export class StaysModule {}
