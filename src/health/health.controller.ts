import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
@Throttle({ default: { limit: 300, ttl: 60000 } })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  async check(@Query('db') db?: string) {
    const base = { status: 'ok', service: 'football-ai-report-api' as const };
    if (db === '1' || db === 'true') {
      const dbCheck = await this.health.checkDb();
      return { ...base, database: dbCheck };
    }
    return base;
  }
}
