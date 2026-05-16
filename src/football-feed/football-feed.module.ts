import { Module } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { FootballFeedController } from './football-feed.controller';
import { FootballFeedService } from './football-feed.service';

@Module({
  imports: [ApiFootballModule],
  controllers: [FootballFeedController],
  providers: [FootballFeedService],
})
export class FootballFeedModule {}
