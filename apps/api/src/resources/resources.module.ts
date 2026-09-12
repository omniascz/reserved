import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { ResourcesController } from './resources.controller.js';
import { ResourcesService } from './resources.service.js';

@Module({
  imports: [DbModule],
  controllers: [ResourcesController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
