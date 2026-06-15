import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { serviceContext } from '@reserved/rls-multitenancy';
import { Public } from '../auth/decorators/public.decorator.js';
import { DbService } from '../db/db.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // Liveness — proces běží. Pro Kubernetes livenessProbe / load balancery.
  @Public()
  @Get()
  check(): {
    status: 'ok';
    service: string;
    version: string;
    uptime: number;
    timestamp: string;
  } {
    return {
      status: 'ok',
      service: 'reserved-api',
      version: '0.0.1',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  // Readiness — ověří DB přímým dotazem (bez @nestjs/terminus, který přes
  // globální exception filtr končil na 500 místo 503). 200 OK / 503 NOT_READY.
  @Public()
  @Get('ready')
  async ready(): Promise<{
    status: string;
    info: Record<string, { status: string }>;
    details: Record<string, { status: string }>;
  }> {
    try {
      await this.dbService.withRlsContext(serviceContext(), (tx) => tx.execute(sql`SELECT 1`));
      // Zpětně kompatibilní tvar s @nestjs/terminus (monitoring + e2e kontrakt).
      const up = { database: { status: 'up' } };
      return { status: 'ok', info: up, details: up };
    } catch {
      throw new ServiceUnavailableException({
        error: { code: 'NOT_READY', message: 'Databáze není dostupná.' },
      });
    }
  }
}
