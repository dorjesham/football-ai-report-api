import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { TacticsService } from './tactics.service';

@ApiTags('tactics')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller()
export class TacticsController {
  constructor(private readonly svc: TacticsService) {}

  @Post('matches/:id/tactics/generate')
  gen(@Param('id') id: string) {
    return this.svc.generate(id);
  }
}
