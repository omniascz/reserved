import { Body, Controller, Headers, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { UploadsService } from './uploads.service.js';

const SignSchema = z.object({
  kind: z.enum(['logo', 'catalog-photo', 'service-image']),
  contentType: z.string().min(1).max(50),
  fileSize: z.number().int().positive().optional(),
});

@ApiTags('uploads')
@Controller()
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly svc: UploadsService) {}

  /** POST /api/v1/admin/uploads/sign — vrátí presigned URL pro upload. */
  @Post('admin/uploads/sign')
  @HttpCode(200)
  async sign(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(SignSchema)) dto: z.infer<typeof SignSchema>,
  ) {
    const data = await this.svc.signUpload(user.tenantId, dto.kind, dto.contentType, dto.fileSize);
    return { data };
  }

  /** PUT /api/v1/admin/uploads/local/:key — local fallback upload (jen dev mode). */
  @Public()
  @Put('admin/uploads/local/*')
  @HttpCode(204)
  async uploadLocal(
    @Req() req: Request,
    @Headers('content-type') contentType: string,
  ): Promise<void> {
    // Extract key from URL after /admin/uploads/local/
    const key = decodeURIComponent(req.url.replace(/^\/admin\/uploads\/local\//, ''));

    // Body je už zparsovaný jako Buffer/JSON v main.ts; potřebujeme raw.
    // Workaround: pokud je body objekt, předpokládáme že express už ho parseoval
    // jako JSON a my potřebujeme rawBody.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const body =
      rawBody ?? (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body)));

    await this.svc.saveLocal(key, body, contentType);
  }
}
