import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { WeatherService } from './weather.service';

@ApiTags('weather')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Post('matches/:id/sync')
  sync(@Param('id') id: string) {
    return this.weather.syncForMatch(id);
  }
}
