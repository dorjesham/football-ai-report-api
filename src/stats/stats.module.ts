import { Module } from '@nestjs/common';
import { StatsReportService } from './stats-report.service';

@Module({
  providers: [StatsReportService],
  exports: [StatsReportService],
})
export class StatsModule {}
