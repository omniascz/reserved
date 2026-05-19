import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service.js';

@Injectable()
export class DbHealthIndicator extends HealthIndicator {
  constructor(private readonly dbService: DbService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.dbService.db.execute(sql`SELECT 1`);
      return this.getStatus(key, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      throw new HealthCheckError('DB check failed', this.getStatus(key, false, { message }));
    }
  }
}
