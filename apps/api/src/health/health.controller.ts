import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { DbHealthIndicator } from './db.health.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbHealth: DbHealthIndicator,
  ) {}

  // Liveness — proces běží. Pro Kubernetes livenessProbe / load balancery.
  // Vždy 200 OK, pokud Node.js běží.
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

  // Readiness — proces je připravený přijímat traffic. Ověří DB.
  // Vrací 200 pokud vše OK, 503 pokud něco selže.
  // Pro Kubernetes readinessProbe / uptime monitoring (UptimeRobot, BetterStack).
  @Public()
  @Get('ready')
  @HealthCheck()
  ready(): Promise<unknown> {
    return this.health.check([() => this.dbHealth.isHealthy('database')]);
  }
}
