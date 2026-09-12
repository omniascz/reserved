import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { VerticalPresetsController } from './vertical-presets.controller.js';
import { VerticalPresetsService } from './vertical-presets.service.js';

@Module({
  imports: [DbModule],
  controllers: [VerticalPresetsController],
  providers: [VerticalPresetsService],
  exports: [VerticalPresetsService],
})
export class VerticalPresetsModule {}
