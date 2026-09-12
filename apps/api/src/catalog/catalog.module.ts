import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CatalogAdminController } from './catalog-admin.controller.js';

@Module({
  controllers: [CatalogController, CatalogAdminController],
  providers: [CatalogService],
})
export class CatalogModule {}
