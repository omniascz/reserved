import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';

@Module({
  imports: [DbModule],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
