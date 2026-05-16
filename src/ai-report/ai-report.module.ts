import { Module } from '@nestjs/common';
import { DeepseekConcurrencyService } from '../capacity/deepseek-concurrency.service';
import { MatchLiveModule } from '../match-live/match-live.module';
import { MatchLlmDossierModule } from '../match-llm-dossier/match-llm-dossier.module';
import { AiReportReviewService } from './ai-report-review.service';
import { AiReportService } from './ai-report.service';
import { AiReportController } from './ai-report.controller';
import { AutoAiReportBatchService } from './auto-ai-report-batch.service';
import { AutoPostMatchReportBatchService } from './auto-post-match-report-batch.service';
import { DeepseekService } from './deepseek.service';
import { LiveNarrativeReportService } from './live-narrative-report.service';
import { PostMatchReportService } from './post-match-report.service';
import { ReportFactCheckService } from './report-fact-check.service';

@Module({
  imports: [MatchLlmDossierModule, MatchLiveModule],
  controllers: [AiReportController],
  providers: [
    DeepseekConcurrencyService,
    AiReportService,
    AutoAiReportBatchService,
    AutoPostMatchReportBatchService,
    DeepseekService,
    PostMatchReportService,
    LiveNarrativeReportService,
    ReportFactCheckService,
    AiReportReviewService,
  ],
  exports: [
    AiReportService,
    AutoAiReportBatchService,
    AutoPostMatchReportBatchService,
    DeepseekService,
    PostMatchReportService,
    LiveNarrativeReportService,
    AiReportReviewService,
    ReportFactCheckService,
  ],
})
export class AiReportModule {}
