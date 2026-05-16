import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { FantasyService } from './fantasy.service';

@ApiTags('fantasy')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller()
export class FantasyController {
  constructor(private readonly svc: FantasyService) {}

  @Post('matches/:id/fantasy/generate')
  gen(@Param('id') id: string) {
    return this.svc.generate(id);
  }

  @Get('matches/:id/fantasy')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post('fantasy/fpl/sync')
  fplSync() {
    return this.svc.syncFplBootstrap();
  }
}
