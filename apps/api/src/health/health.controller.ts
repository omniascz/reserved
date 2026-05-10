import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
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
