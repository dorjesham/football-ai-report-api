import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { PredictionService } from './prediction.service';

@ApiTags('prediction')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller()
export class PredictionController {
  constructor(private readonly prediction: PredictionService) {}

  @Post('matches/:id/generate-prediction')
  generate(@Param('id') id: string) {
    return this.prediction.generateForMatch(id);
  }

  @Get('matches/:id/prediction/versions')
  @ApiOperation({ summary: 'Admin：列出比赛预测历史版本' })
  listVersions(@Param('id') id: string) {
    return this.prediction.listVersions(id);
  }
}
