import { Module } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';

@Module({
  imports: [ApiFootballModule],
  controllers: [RankingsController],
  providers: [RankingsService],
  exports: [RankingsService],
})
export class RankingsModule {}
