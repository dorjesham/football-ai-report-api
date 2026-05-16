import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { HeadToHeadService } from './head-to-head.service';

@ApiTags('head-to-head')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller()
export class HeadToHeadController {
  constructor(private readonly svc: HeadToHeadService) {}

  @Post('matches/:id/head-to-head/generate')
  gen(@Param('id') id: string) {
    return this.svc.generate(id);
  }

  @Get('matches/:id/head-to-head')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post('head-to-head/import/manual')
  manualImport(@Body() body: Record<string, unknown>) {
    const matchId = String(body.matchId ?? body['match-id'] ?? '');
    if (!matchId) {
      return { ok: false, message: '缺少 matchId' };
    }
    return this.svc.importManual(matchId, body);
  }

  @Post('head-to-head/import/kaggle-placeholder')
  kaggle(@Body() body: Record<string, unknown>) {
    return this.svc.kaggleHeadToHeadPlaceholder(body || {});
  }
}
