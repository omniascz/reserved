import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DbModule } from '../db/db.module.js';
import { PlatformAuthController } from './platform-auth.controller.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformAuditService } from './platform-audit.service.js';
import { PlatformJwtService } from './platform-jwt.service.js';
import { PlatformGuard } from './platform.guard.js';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [PlatformAuthController],
  providers: [PlatformAuthService, PlatformAuditService, PlatformJwtService, PlatformGuard],
  exports: [PlatformJwtService, PlatformGuard, PlatformAuditService],
})
export class PlatformModule {}
