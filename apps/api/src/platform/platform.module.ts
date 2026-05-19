import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DbModule } from '../db/db.module.js';
import { PlatformAuthController } from './platform-auth.controller.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformAuditService } from './platform-audit.service.js';
import { PlatformJwtService } from './platform-jwt.service.js';
import { PlatformGuard } from './platform.guard.js';
import { PlatformTenantsController } from './platform-tenants.controller.js';
import { PlatformTenantsService } from './platform-tenants.service.js';
import { PlatformTenantActionsService } from './platform-tenant-actions.service.js';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [PlatformAuthController, PlatformTenantsController],
  providers: [
    PlatformAuthService,
    PlatformAuditService,
    PlatformJwtService,
    PlatformGuard,
    PlatformTenantsService,
    PlatformTenantActionsService,
  ],
  exports: [PlatformJwtService, PlatformGuard, PlatformAuditService],
})
export class PlatformModule {}
