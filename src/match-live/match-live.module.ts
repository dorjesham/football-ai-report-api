import { Module, forwardRef } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { AuthModule } from '../auth/auth.module';
import { MatchPhaseModule } from '../match-phase/match-phase.module';
import { FootballDataModule } from '../football-data/football-data.module';
import { MatchLiveController } from './match-live.controller';
import { MatchLiveFactsIngestService } from './match-live-facts-ingest.service';
import { MatchLiveService } from './match-live.service';
import { MatchLiveSseService } from './match-live-sse.service';
import { LiveUpdatePublisherService } from './live-update.publisher.service';

@Module({
  imports: [
    ApiFootballModule,
    FootballDataModule,
    AuthModule,
    forwardRef(() => MatchPhaseModule),
  ],
  controllers: [MatchLiveController],
  providers: [
    MatchLiveService,
    MatchLiveSseService,
    LiveUpdatePublisherService,
    MatchLiveFactsIngestService,
  ],
  exports: [
    MatchLiveService,
    MatchLiveFactsIngestService,
    LiveUpdatePublisherService,
  ],
})
export class MatchLiveModule {}
