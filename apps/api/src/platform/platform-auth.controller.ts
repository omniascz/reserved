// Master admin (provozovatel platformy) endpoints — /api/v1/platform/auth/*.
//
// Login/refresh/logout jsou @Public() (opt-out z globalniho admin JwtGuard).
// /me a /change-password vyzaduji platform JWT, hlidane PlatformGuard.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { PlatformAuthService, type PlatformTokenPair } from './platform-auth.service.js';
import { PlatformGuard } from './platform.guard.js';
import { CurrentPlatformAdmin } from './decorators/current-admin.decorator.js';
import type { PlatformAccessPayload } from './platform-jwt.service.js';
import {
  PlatformLoginSchema,
  PlatformRefreshSchema,
  PlatformChangePasswordSchema,
  type PlatformLoginDto,
  type PlatformRefreshDto,
  type PlatformChangePasswordDto,
} from './dto/platform-auth.dto.js';

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(@Inject(PlatformAuthService) private readonly auth: PlatformAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Body(new ZodValidationPipe(PlatformLoginSchema)) dto: PlatformLoginDto,
  ): Promise<PlatformTokenPair> {
    return this.auth.login(dto, {
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(PlatformRefreshSchema)) dto: PlatformRefreshDto,
  ): Promise<PlatformTokenPair> {
    return this.auth.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(PlatformRefreshSchema)) dto: PlatformRefreshDto,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Public() // opt-out z globalniho admin JwtGuard
  @UseGuards(PlatformGuard)
  @Get('me')
  async me(@CurrentPlatformAdmin() admin: PlatformAccessPayload): Promise<{
    data: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      lastLoginAt: Date | null;
      createdAt: Date;
    };
  }> {
    const profile = await this.auth.getMe(admin.sub);
    return { data: profile };
  }

  @Public()
  @UseGuards(PlatformGuard)
  @Patch('me/password')
  @HttpCode(204)
  async changePassword(
    @Req() req: Request,
    @CurrentPlatformAdmin() admin: PlatformAccessPayload,
    @Body(new ZodValidationPipe(PlatformChangePasswordSchema)) dto: PlatformChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(admin.sub, dto, {
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
  }
}
