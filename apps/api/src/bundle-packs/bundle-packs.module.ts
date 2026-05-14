import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { BundlePacksController } from './bundle-packs.controller.js';
import { BundlePacksService } from './bundle-packs.service.js';

@Module({
  imports: [DbModule],
  controllers: [BundlePacksController],
  providers: [BundlePacksService],
  exports: [BundlePacksService],
})
export class BundlePacksModule {}
