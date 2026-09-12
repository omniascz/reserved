import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { z } from 'zod';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { ThemeService, type TenantTheme } from './theme.service.js';

const ThemePatchSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  borderRadius: z.enum(['none', 'sm', 'md', 'lg', 'xl']).nullable().optional(),
  logoUrl: z.string().url().max(2000).nullable().optional(),
  fontFamily: z.enum(['system', 'serif', 'sans']).nullable().optional(),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  customCss: z.string().max(10_000).nullable().optional(),
});

@ApiTags('theme')
@Controller('admin/theme')
export class ThemeController {
  constructor(@Inject(ThemeService) private readonly svc: ThemeService) {}

  @Get()
  async get(@CurrentUser() user: AccessTokenPayload): Promise<{ data: TenantTheme }> {
    const data = await this.svc.get(user.tenantId);
    return { data };
  }

  @Patch()
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(ThemePatchSchema)) dto: z.infer<typeof ThemePatchSchema>,
  ): Promise<{ data: TenantTheme }> {
    const data = await this.svc.update(user.tenantId, dto);
    return { data };
  }
}
