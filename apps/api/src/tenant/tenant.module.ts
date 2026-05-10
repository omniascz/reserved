import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { TenantConfig } from './tenant.config.js';
import { TenantMiddleware } from './tenant.middleware.js';
import { DrizzleTenantLookup } from './tenant-lookup.service.js';

@Module({
  imports: [DbModule],
  providers: [TenantConfig, DrizzleTenantLookup, TenantMiddleware],
  exports: [TenantConfig, DrizzleTenantLookup, TenantMiddleware],
})
export class TenantModule {}
