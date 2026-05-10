import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('health')
export class HealthController {
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
}
