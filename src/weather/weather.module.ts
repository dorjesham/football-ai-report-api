import { Module } from '@nestjs/common';
import { MatchIntelModule } from '../match-intel/match-intel.module';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';

@Module({
  imports: [MatchIntelModule],
  controllers: [WeatherController],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
