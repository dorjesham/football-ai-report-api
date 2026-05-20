import { Module } from '@nestjs/common';
import { MatchIntelModule } from '../match-intel/match-intel.module';
import { MatchAfRawBundleModule } from '../match-af-raw-bundle/match-af-raw-bundle.module';
import { WeatherModule } from '../weather/weather.module';
import { AfSyncOrchestrator } from './af-sync-orchestrator.service';
import { ApiFootballQuotaService } from './api-football-quota.service';
import { ApiFootballService } from './api-football.service';
import { ApiFootballIngestService } from './api-football-ingest.service';
import { MatchAfFactsLiveSyncService } from './match-af-facts-live-sync.service';
import { MatchAfPlayersLiveSyncService } from './match-af-players-live-sync.service';
import { MatchAfFactsSyncService } from './match-af-facts-sync.service';
import { MatchAfPreMatchSnapshotService } from './match-af-pre-match-snapshot.service';
import { MatchOddsSnapshotService } from './match-odds-snapshot.service';
import { AfCatalogSyncService } from './af-catalog-sync.service';
import { MatchOddsLiveSyncService } from './match-odds-live-sync.service';

@Module({
  imports: [WeatherModule, MatchAfRawBundleModule, MatchIntelModule],
  providers: [
    AfSyncOrchestrator,
    ApiFootballQuotaService,
    ApiFootballService,
    MatchAfFactsSyncService,
    MatchAfFactsLiveSyncService,
    MatchAfPlayersLiveSyncService,
    MatchAfPreMatchSnapshotService,
    MatchOddsSnapshotService,
    AfCatalogSyncService,
    MatchOddsLiveSyncService,
    ApiFootballIngestService,
  ],
  exports: [
    AfSyncOrchestrator,
    ApiFootballQuotaService,
    ApiFootballService,
    MatchAfFactsSyncService,
    MatchAfFactsLiveSyncService,
    MatchAfPlayersLiveSyncService,
    MatchAfPreMatchSnapshotService,
    MatchOddsSnapshotService,
    AfCatalogSyncService,
    MatchOddsLiveSyncService,
    ApiFootballIngestService,
  ],
})
export class ApiFootballModule {}
