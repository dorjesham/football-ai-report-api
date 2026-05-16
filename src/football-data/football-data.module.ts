import { Module } from '@nestjs/common';
import { ApiFootballModule } from '../api-football/api-football.module';
import { MatchFdLiveSyncService } from './match-fd-live-sync.service';
import { FootballDataService } from './football-data.service';
import { FootballDataController } from './football-data.controller';
import { ScheduleAuditService } from './schedule-audit.service';

@Module({
  imports: [ApiFootballModule],
  controllers: [FootballDataController],
  providers: [FootballDataService, ScheduleAuditService, MatchFdLiveSyncService],
  exports: [FootballDataService, ScheduleAuditService, MatchFdLiveSyncService],
})
export class FootballDataModule {}
