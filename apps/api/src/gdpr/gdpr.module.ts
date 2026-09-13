import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { GdprController } from './gdpr.controller.js';
import { GdprService } from './gdpr.service.js';

@Module({
  imports: [DbModule],
  controllers: [GdprController],
  providers: [GdprService],
  exports: [GdprService],
})
export class GdprModule {}
