import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { PlayerIntelligenceService } from './player-intelligence.service';

@ApiTags('player-intelligence')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller()
export class PlayerIntelligenceController {
  constructor(private readonly svc: PlayerIntelligenceService) {}

  @Post('matches/:id/player-intelligence/generate')
  generate(@Param('id') id: string) {
    return this.svc.generate(id);
  }

  @Get('matches/:id/player-intelligence')
  list(@Param('id') id: string) {
    return this.svc.list(id);
  }
}
