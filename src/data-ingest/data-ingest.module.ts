import { Module } from '@nestjs/common';
import { AiReportModule } from '../ai-report/ai-report.module';
import { ApiFootballModule } from '../api-football/api-football.module';
import { FootballDataModule } from '../football-data/football-data.module';
import { PredictionModule } from '../prediction/prediction.module';
import { DataIngestController } from './data-ingest.controller';
import { DataIngestService } from './data-ingest.service';
import { FdFinishedIngestService } from './fd-finished-ingest.service';
import { FdPlayerIngestService } from './fd-player-ingest.service';
import { OpenFootballIngestService } from './openfootball-ingest.service';
import { RawPayloadStructureService } from './raw-payload-structure.service';
import { PlayerIngestAuditService } from './player-ingest-audit.service';
import { FbrefCsvIngestService } from './fbref-csv-ingest.service';
import { StatsbombIngestService } from './statsbomb-ingest.service';
import { MatchFactsModule } from '../match-facts/match-facts.module';
import { OpsModule } from '../ops/ops.module';

@Module({
  imports: [
    AiReportModule,
    FootballDataModule,
    ApiFootballModule,
    PredictionModule,
    MatchFactsModule,
    OpsModule,
  ],
  controllers: [DataIngestController],
  providers: [
    DataIngestService,
    FdFinishedIngestService,
    FdPlayerIngestService,
    OpenFootballIngestService,
    StatsbombIngestService,
    RawPayloadStructureService,
    PlayerIngestAuditService,
    FbrefCsvIngestService,
  ],
  exports: [DataIngestService],
})
export class DataIngestModule {}
