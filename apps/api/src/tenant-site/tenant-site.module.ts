import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module.js';
import { TenantSiteController } from './tenant-site.controller.js';
import { TenantSiteAdminController } from './tenant-site-admin.controller.js';
import { TenantSiteService } from './tenant-site.service.js';

@Module({
  imports: [TenantModule],
  controllers: [TenantSiteController, TenantSiteAdminController],
  providers: [TenantSiteService],
})
export class TenantSiteModule {}
