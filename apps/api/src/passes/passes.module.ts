import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { PassesController } from './passes.controller.js';
import { PassesService } from './passes.service.js';

@Module({
  imports: [DbModule],
  controllers: [PassesController],
  providers: [PassesService],
  exports: [PassesService],
})
export class PassesModule {}
