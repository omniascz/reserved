import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('catalog')
@Controller('public/catalog')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly svc: CatalogService) {}

  /** GET /api/v1/public/catalog?city=Praha&businessType=hair_salon&search=Petra */
  @Public()
  @Get()
  async list(
    @Query('city') city?: string,
    @Query('businessType') businessType?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.svc.list({
      city,
      businessType,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** GET /api/v1/public/catalog/:slug — plný tenant profile s službami. */
  @Public()
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    const data = await this.svc.getBySlug(slug);
    return { data };
  }
}
