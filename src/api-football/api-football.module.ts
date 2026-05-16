import { Module } from '@nestjs/common';
import { WeatherModule } from '../weather/weather.module';
import { ApiFootballService } from './api-football.service';
import { ApiFootballIngestService } from './api-football-ingest.service';
import { MatchAfFactsLiveSyncService } from './match-af-facts-live-sync.service';
import { MatchAfFactsSyncService } from './match-af-facts-sync.service';
import { MatchAfPreMatchSnapshotService } from './match-af-pre-match-snapshot.service';
import { MatchOddsSnapshotService } from './match-odds-snapshot.service';

@Module({
  imports: [WeatherModule],
  providers: [
    ApiFootballService,
    MatchAfFactsSyncService,
    MatchAfFactsLiveSyncService,
    MatchAfPreMatchSnapshotService,
    MatchOddsSnapshotService,
    ApiFootballIngestService,
  ],
  exports: [
    ApiFootballService,
    MatchAfFactsSyncService,
    MatchAfFactsLiveSyncService,
    MatchAfPreMatchSnapshotService,
    MatchOddsSnapshotService,
    ApiFootballIngestService,
  ],
})
export class ApiFootballModule {}
